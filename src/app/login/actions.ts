"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma, withSecrets } from "@/lib/db";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { matchesCouncil, parseLoginId } from "@/lib/login";
import { UFS } from "@/lib/patient";
import { open, seal } from "@/lib/signature/secret-box";
import { hashRecoveryCode, verifyTotp } from "@/lib/totp";

export type LoginState = { error: string; step?: "codigo" };

// Depois de MAX_FAILURES senhas ou códigos errados em LOCK_MINUTES, o login fica bloqueado
// por LOCK_MINUTES. Contamos pela auditoria, que já guarda cada tentativa que falhou.
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
// Do mesmo endereço (IP), contando logins que nem existem: impede testar muitas contas.
const MAX_FAILURES_PER_IP = 20;

const TWO_FACTOR_COOKIE = "login-2fa";
const TWO_FACTOR_MINUTES = 5;

// Encontra o usuário pelo e-mail, CPF ou número do conselho (com a UF), dentro da clínica.
async function findUser(clinicId: string, id: NonNullable<ReturnType<typeof parseLoginId>>, uf: string) {
  if (id.kind === "email") return prisma.user.findUnique({ where: { clinicId_email: { clinicId, email: id.email } }, omit: withSecrets });
  if (id.kind === "cpf") return prisma.user.findUnique({ where: { clinicId_cpf: { clinicId, cpf: id.cpf } }, omit: withSecrets });
  const professionals = await prisma.user.findMany({ where: { clinicId, councilNumber: { not: null } }, omit: withSecrets });
  const found = professionals.filter((u) => matchesCouncil(u, id, uf));
  // Dois profissionais com o mesmo número (ex.: um CRM e um CRP): pede o e-mail ou o CPF.
  return found.length === 1 ? found[0] : null;
}

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
}

// Falhas recentes da pessoa (desde o último login certo) e do IP.
async function isLocked(clinicId: string, userId: string | null) {
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000);
  const ip = await clientIp();
  if (ip) {
    const byIp = await prisma.auditLog.count({ where: { action: "LOGIN_FALHOU", ip, createdAt: { gte: since } } });
    if (byIp >= MAX_FAILURES_PER_IP) return true;
  }
  if (!userId) return false;
  const lastLogin = await prisma.auditLog.findFirst({
    where: { clinicId, userId, action: "LOGIN", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const failures = await prisma.auditLog.count({
    where: { clinicId, userId, action: "LOGIN_FALHOU", createdAt: { gte: lastLogin?.createdAt ?? since } },
  });
  return failures >= MAX_FAILURES;
}

const lockedMessage = `Muitas tentativas erradas. Por segurança, o acesso ficou bloqueado por ${LOCK_MINUTES} minutos.`;

async function finishLogin(user: { id: string; clinicId: string; mustChangePassword: boolean }): Promise<never> {
  await createSession(user.id);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOGIN", entity: "User", entityId: user.id });
  redirect(user.mustChangePassword ? "/nova-senha" : "/");
}

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const slug = String(formData.get("clinic") ?? "").trim().toLowerCase();
  const loginId = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const id = parseLoginId(loginId);
  // A UF vem do campo próprio ou de quem digitou junto, como "38526/GO".
  const uf = String(formData.get("uf") ?? "") || (id?.kind === "council" ? (id.letters.find((l) => UFS.includes(l)) ?? "") : "");
  if (id?.kind === "council" && !uf) return { error: "Escolha a UF do seu conselho." };

  const clinic = await prisma.clinic.findUnique({ where: { slug } });
  const user = clinic && id ? await findUser(clinic.id, id, uf) : null;
  if (clinic && (await isLocked(clinic.id, user?.id ?? null))) return { error: lockedMessage };
  const ok = user?.active && user.systemAccess && (await bcrypt.compare(password, user.passwordHash));

  if (!clinic || !user || !ok) {
    if (clinic) await audit({ clinicId: clinic.id, userId: user?.id, action: "LOGIN_FALHOU", entity: "User", details: { login: loginId } });
    return { error: "Clínica, login ou senha incorretos." };
  }

  if (!clinic.active) {
    await audit({ clinicId: clinic.id, userId: user.id, action: "LOGIN_FALHOU", entity: "User", details: { login: loginId, motivo: "clínica suspensa" } });
    return { error: "O acesso desta clínica está suspenso. Fale com o suporte do sistema." };
  }

  // Com verificação em duas etapas, a senha certa só leva ao pedido do código do celular.
  if (user.totpEnabledAt) {
    const expires = Date.now() + TWO_FACTOR_MINUTES * 60_000;
    (await cookies()).set(TWO_FACTOR_COOKIE, seal(JSON.stringify({ userId: user.id, expires })), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: TWO_FACTOR_MINUTES * 60,
      path: "/login",
    });
    return { error: "", step: "codigo" };
  }

  return finishLogin(user);
}

// Segunda etapa: o código de 6 números do app, ou um código de recuperação.
export async function loginCode(_: LoginState, formData: FormData): Promise<LoginState> {
  const jar = await cookies();
  const raw = jar.get(TWO_FACTOR_COOKIE)?.value;
  let pending: { userId: string; expires: number } | null = null;
  try {
    pending = raw ? JSON.parse(open(raw)) : null;
  } catch {
    pending = null;
  }
  const expired = { error: "O tempo para digitar o código acabou. Entre de novo com a sua senha." };
  if (!pending || pending.expires < Date.now()) return expired;

  const user = await prisma.user.findUnique({ where: { id: pending.userId }, omit: withSecrets, include: { clinic: true } });
  if (!user?.active || !user.systemAccess || !user.clinic.active || !user.totpSecret || !user.totpEnabledAt) return expired;
  if (await isLocked(user.clinicId, user.id)) {
    jar.delete({ name: TWO_FACTOR_COOKIE, path: "/login" });
    return { error: lockedMessage };
  }

  const code = String(formData.get("code") ?? "").trim();
  const step = verifyTotp(open(user.totpSecret), code, user.totpLastStep);
  const recovery = step === null ? hashRecoveryCode(code) : null;
  const usedRecovery = recovery !== null && user.totpRecoveryCodes.includes(recovery);

  if (step === null && !usedRecovery) {
    await audit({ clinicId: user.clinicId, userId: user.id, action: "LOGIN_FALHOU", entity: "User", details: { etapa: "código" } });
    return { error: "Código incorreto. Confira o app e tente de novo.", step: "codigo" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: step !== null ? { totpLastStep: step } : { totpRecoveryCodes: user.totpRecoveryCodes.filter((c) => c !== recovery) },
  });
  if (usedRecovery) {
    await audit({ clinicId: user.clinicId, userId: user.id, action: "CODIGO_RECUPERACAO_USADO", entity: "User", entityId: user.id });
  }
  jar.delete({ name: TWO_FACTOR_COOKIE, path: "/login" });
  return finishLogin(user);
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await audit({ clinicId: user.clinicId, userId: user.id, action: "LOGOUT", entity: "User", entityId: user.id });
  await destroySession();
  redirect("/login");
}
