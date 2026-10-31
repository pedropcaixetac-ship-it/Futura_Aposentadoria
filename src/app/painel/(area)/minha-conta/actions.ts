"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, withSecrets } from "@/lib/db";
import { endOtherPlatformSessions, platformAudit, requirePlatformUser } from "@/lib/painel-auth";
import { validateNewPassword } from "@/lib/staff";
import { open, seal } from "@/lib/signature/secret-box";
import { hashRecoveryCode, newRecoveryCodes, newTotpSecret, TWO_FACTOR_OFF, verifyTotp } from "@/lib/totp";

export type FormState = { error: string; ok?: string };

async function checkPassword(userId: string, typed: string) {
  const { passwordHash } = await prisma.platformUser.findUniqueOrThrow({ where: { id: userId }, omit: withSecrets });
  return bcrypt.compare(typed, passwordHash);
}

// Também é a tela de senha provisória (/painel/nova-senha): depois de criar a própria senha, segue para o painel.
export async function changePlatformPassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePlatformUser({ passwordChange: true });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  if (!(await checkPassword(user.id, current))) return { error: "A senha atual está errada." };
  const error = validateNewPassword(current, next, String(formData.get("confirm") ?? ""), user);
  if (error) return { error };

  await prisma.platformUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false } });
  await endOtherPlatformSessions(user.id);
  await platformAudit({ userId: user.id, action: "PAINEL_SENHA_ALTERADA" });
  if (user.mustChangePassword) redirect("/painel");
  return { error: "", ok: "Senha trocada. Use a nova senha da próxima vez que entrar." };
}

// Verificação em duas etapas: gera o segredo desligado, mostra o QR e só liga com um código certo.
export async function startPlatformTwoFactor() {
  const user = await requirePlatformUser();
  if (user.totpEnabledAt) return;
  await prisma.platformUser.update({ where: { id: user.id }, data: { totpSecret: seal(newTotpSecret()), totpLastStep: null } });
  revalidatePath("/painel/minha-conta");
}

export async function cancelPlatformTwoFactor() {
  const user = await requirePlatformUser();
  if (user.totpEnabledAt) return;
  await prisma.platformUser.update({ where: { id: user.id }, data: { totpSecret: null } });
  revalidatePath("/painel/minha-conta");
}

export type TwoFactorState = { error: string; codes?: string[] };

export async function confirmPlatformTwoFactor(_: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const user = await requirePlatformUser();
  const { totpSecret } = await prisma.platformUser.findUniqueOrThrow({ where: { id: user.id }, omit: withSecrets });
  if (user.totpEnabledAt || !totpSecret) return { error: "Comece de novo pelo botão Ativar." };
  const step = verifyTotp(open(totpSecret), String(formData.get("code") ?? ""), null);
  if (step === null) return { error: "Código incorreto. Confira se o relógio do celular está certo e digite o código que aparece agora." };

  const codes = newRecoveryCodes();
  await prisma.platformUser.update({
    where: { id: user.id },
    data: { totpEnabledAt: new Date(), totpLastStep: step, totpRecoveryCodes: codes.map(hashRecoveryCode) },
  });
  await platformAudit({ userId: user.id, action: "PAINEL_DUAS_ETAPAS_ATIVADA" });
  return { error: "", codes };
}

// Desligar pede a senha, para quem achar o computador aberto não conseguir tirar a proteção.
export async function disablePlatformTwoFactor(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePlatformUser();
  if (!(await checkPassword(user.id, String(formData.get("current") ?? "")))) return { error: "A senha está errada." };
  await prisma.platformUser.update({ where: { id: user.id }, data: { ...TWO_FACTOR_OFF } });
  await platformAudit({ userId: user.id, action: "PAINEL_DUAS_ETAPAS_DESATIVADA" });
  revalidatePath("/painel/minha-conta");
  return { error: "", ok: "Verificação em duas etapas desligada." };
}
