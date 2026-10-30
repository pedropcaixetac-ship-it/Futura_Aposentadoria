"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { validateNewPassword } from "@/lib/staff";

export type FormState = { error: string; ok?: string };

// A própria pessoa só troca a senha; os demais dados quem altera é o administrador.
export async function changeOwnPassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await bcrypt.compare(current, passwordHash))) return { error: "A senha atual está errada." };
  const error = validateNewPassword(current, next, confirm);
  if (error) return { error };

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "SENHA_ALTERADA", entity: "User", entityId: user.id });
  return { error: "", ok: "Senha trocada. Use a nova senha da próxima vez que entrar." };
}

// Encerra a autorização do certificado em nuvem (o app volta a pedir confirmação na próxima assinatura).
export async function endSession(provider: string) {
  const user = await requireUser("assinatura");
  await prisma.signatureSession.deleteMany({ where: { userId: user.id, provider } });
  revalidatePath("/meu-cadastro");
}
