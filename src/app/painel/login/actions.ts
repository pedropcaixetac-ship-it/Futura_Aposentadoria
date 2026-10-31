"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma, withSecrets } from "@/lib/db";
import { clientIp, createPlatformSession, destroyPlatformSession, getPlatformUser, platformAudit } from "@/lib/painel-auth";
import { passwordProblem } from "@/lib/password";
import { open, seal } from "@/lib/signature/secret-box";
import { hashRecoveryCode, verifyTotp } from "@/lib/totp";

export type PlatformLoginState = { error: string; step?: "codigo" };

// Mesmas travas do login das clínicas: 5 erros da mesma conta ou 20 do mesmo endereço (IP)
// em 15 minutos bloqueiam por 15 minutos. Conta pelo registro de ações, que guarda cada tentativa.
const MAX_FAILURES = 5;
const MAX_FAILURES_PER_IP = 20;
const LOCK_MINUTES = 15;
const lockedMessage = `Muitas tentativas erradas. Por segurança, o acesso ficou bloqueado por ${LOCK_MINUTES} minutos.`;

const TWO_FACTOR_COOKIE = "painel-2fa";
const TWO_FACTOR_MINUTES = 5;

async function isLocked(userId: string | null) {
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000);
  const ip = await clientIp();
  if (ip) {
    const byIp = await prisma.platformAuditLog.count({ where: { action: "PAINEL_LOGIN_FALHOU", ip, createdAt: { gte: since } } });
    if (byIp >= MAX_FAILURES_PER_IP) return true;
  }
  if (!userId) return false;
  const lastLogin = await prisma.platformAuditLog.findFirst({
    where: { userId, action: "PAINEL_LOGIN", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const failures = await prisma.platformAuditLog.count({
    where: { userId, action: "PAINEL_LOGIN_FALHOU", createdAt: { gte: lastLogin?.createdAt ?? since } },
  });
  return failures >= MAX_FAILURES;
}

async function finishLogin(user: { id: string }, weakPassword: boolean): Promise<never> {
  // Senha que não segue as regras (como a de demonstração): só entra depois de criar uma nova.
  await prisma.platformUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), ...(weakPassword ? { mustChangePassword: true } : {}) },
  });
  await createPlatformSession(user.id);
  await platformAudit({ userId: user.id, action: "PAINEL_LOGIN" });
  redirect("/painel");
}

export async function platformLogin(_: PlatformLoginState, formData: FormData): Promise<PlatformLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = email ? await prisma.platformUser.findUnique({ where: { email }, omit: withSecrets }) : null;
  if (await isLocked(user?.id ?? null)) return { error: lockedMessage };
  const ok = user?.active && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !ok) {
    await platformAudit({ userId: user?.id, action: "PAINEL_LOGIN_FALHOU", details: { email } });
    return { error: "E-mail ou senha incorretos." };
  }

  const weakPassword = passwordProblem(password, user) !== null;
  if (user.totpEnabledAt) {
    const expires = Date.now() + TWO_FACTOR_MINUTES * 60_000;
    (await cookies()).set(TWO_FACTOR_COOKIE, seal(JSON.stringify({ userId: user.id, expires, weakPassword })), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: TWO_FACTOR_MINUTES * 60,
      path: "/painel/login",
    });
    return { error: "", step: "codigo" };
  }
  return finishLogin(user, weakPassword);
}

// Segunda etapa: o código de 6 números do app, ou um código de recuperação.
export async function platformLoginCode(_: PlatformLoginState, formData: FormData): Promise<PlatformLoginState> {
  const jar = await cookies();
  const raw = jar.get(TWO_FACTOR_COOKIE)?.value;
  let pending: { userId: string; expires: number; weakPassword: boolean } | null = null;
  try {
    pending = raw ? JSON.parse(open(raw)) : null;
  } catch {
    pending = null;
  }
  const expired = { error: "O tempo para digitar o código acabou. Entre de novo com a sua senha." };
  if (!pending || pending.expires < Date.now()) return expired;

  const user = await prisma.platformUser.findUnique({ where: { id: pending.userId }, omit: withSecrets });
  if (!user?.active || !user.totpSecret || !user.totpEnabledAt) return expired;
  if (await isLocked(user.id)) {
    jar.delete({ name: TWO_FACTOR_COOKIE, path: "/painel/login" });
    return { error: lockedMessage };
  }

  const code = String(formData.get("code") ?? "").trim();
  const step = verifyTotp(open(user.totpSecret), code, user.totpLastStep);
  const recovery = step === null ? hashRecoveryCode(code) : null;
  const usedRecovery = recovery !== null && user.totpRecoveryCodes.includes(recovery);
  if (step === null && !usedRecovery) {
    await platformAudit({ userId: user.id, action: "PAINEL_LOGIN_FALHOU", details: { etapa: "código" } });
    return { error: "Código incorreto. Confira o app e tente de novo.", step: "codigo" };
  }

  await prisma.platformUser.update({
    where: { id: user.id },
    data: step !== null ? { totpLastStep: step } : { totpRecoveryCodes: user.totpRecoveryCodes.filter((c) => c !== recovery) },
  });
  if (usedRecovery) await platformAudit({ userId: user.id, action: "PAINEL_CODIGO_RECUPERACAO" });
  jar.delete({ name: TWO_FACTOR_COOKIE, path: "/painel/login" });
  return finishLogin(user, pending.weakPassword);
}

export async function platformLogout() {
  const user = await getPlatformUser();
  if (user) await platformAudit({ userId: user.id, action: "PAINEL_LOGOUT" });
  await destroyPlatformSession();
  redirect("/painel/login");
}
