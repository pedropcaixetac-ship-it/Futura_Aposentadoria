"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { endOtherSessions, getCurrentUser, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { validateNewPassword } from "@/lib/staff";
import { open, seal } from "@/lib/signature/secret-box";
import { hashRecoveryCode, newRecoveryCodes, newTotpSecret, TWO_FACTOR_OFF, verifyTotp } from "@/lib/totp";

export type FormState = { error: string; ok?: string };

// A própria pessoa só troca a senha; os demais dados quem altera é o administrador.
// Também serve para a senha nova do primeiro acesso (/nova-senha), por isso não usa requireUser,
// que mandaria a pessoa de volta para lá.
export async function changeOwnPassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await bcrypt.compare(current, passwordHash))) return { error: "A senha atual está errada." };
  const error = validateNewPassword(current, next, confirm, user);
  if (error) return { error };

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false } });
  await endOtherSessions(user.id);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "SENHA_ALTERADA", entity: "User", entityId: user.id });
  // Primeiro acesso: com a senha própria criada, segue para o sistema.
  if (user.mustChangePassword) redirect("/");
  return { error: "", ok: "Senha trocada. Use a nova senha da próxima vez que entrar." };
}

// Encerra a autorização do certificado em nuvem (o app volta a pedir confirmação na próxima assinatura).
export async function endSession(provider: string) {
  const user = await requireUser("assinatura");
  await prisma.signatureSession.deleteMany({ where: { userId: user.id, provider } });
  revalidatePath("/meu-cadastro");
}

// Verificação em duas etapas. Primeiro gera o segredo (ainda desligado) e mostra o QR code;
// só liga depois que a pessoa digita um código certo, para ninguém ficar trancado por um QR mal lido.
export async function startTwoFactor() {
  const user = await requireUser();
  if (user.totpEnabledAt) return;
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: seal(newTotpSecret()), totpLastStep: null } });
  revalidatePath("/meu-cadastro");
}

export async function cancelTwoFactor() {
  const user = await requireUser();
  if (user.totpEnabledAt) return;
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: null } });
  revalidatePath("/meu-cadastro");
}

export type TwoFactorState = { error: string; codes?: string[] };

export async function confirmTwoFactor(_: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const user = await requireUser();
  const { totpSecret } = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { totpSecret: true } });
  if (user.totpEnabledAt || !totpSecret) return { error: "Comece de novo pelo botão Ativar." };
  const step = verifyTotp(open(totpSecret), String(formData.get("code") ?? ""), null);
  if (step === null) return { error: "Código incorreto. Confira se o relógio do celular está certo e digite o código que aparece agora." };

  const codes = newRecoveryCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: new Date(), totpLastStep: step, totpRecoveryCodes: codes.map(hashRecoveryCode) },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "DUAS_ETAPAS_ATIVADA", entity: "User", entityId: user.id });
  return { error: "", codes };
}

// Desligar pede a senha, para quem achar o computador aberto não conseguir tirar a proteção.
export async function disableTwoFactor(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await bcrypt.compare(String(formData.get("current") ?? ""), passwordHash))) return { error: "A senha está errada." };
  await prisma.user.update({ where: { id: user.id }, data: { ...TWO_FACTOR_OFF } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "DUAS_ETAPAS_DESATIVADA", entity: "User", entityId: user.id });
  revalidatePath("/meu-cadastro");
  return { error: "", ok: "Verificação em duas etapas desligada." };
}
