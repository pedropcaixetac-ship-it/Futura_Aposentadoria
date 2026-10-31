"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { platformAudit, requirePlatformUser } from "@/lib/painel-auth";
import { parseNotice } from "@/lib/avisos";

export type FormState = { error: string; ok?: string };

export async function createNotice(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePlatformUser();
  const input = parseNotice(formData);
  if (typeof input === "string") return { error: input };
  if (input.clinicId && !(await prisma.clinic.findUnique({ where: { id: input.clinicId }, select: { id: true } }))) {
    return { error: "Clínica não encontrada." };
  }
  const notice = await prisma.platformNotice.create({ data: { ...input, createdById: me.id } });
  await platformAudit({ userId: me.id, action: "AVISO_CRIADO", clinicId: input.clinicId, details: { aviso: notice.id, titulo: input.title } });
  revalidatePath("/painel/avisos");
  return { error: "", ok: "Aviso publicado." };
}

// Tira o aviso do ar na hora (fica na lista como encerrado).
export async function endNotice(id: string) {
  const me = await requirePlatformUser();
  const notice = await prisma.platformNotice.update({ where: { id }, data: { endsAt: new Date() } });
  await platformAudit({ userId: me.id, action: "AVISO_ENCERRADO", clinicId: notice.clinicId, details: { aviso: id, titulo: notice.title } });
  revalidatePath("/painel/avisos");
}
