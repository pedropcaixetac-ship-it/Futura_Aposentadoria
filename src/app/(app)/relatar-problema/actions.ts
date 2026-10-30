"use server";

import { getCurrentUser, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cleanPage, parseReport, recordError, validateReport } from "@/lib/problems";

export type FormState = { error: string; ok?: string };

// Relato escrito por quem usa o sistema. Vai para "Problemas" no Painel do dono.
export async function reportProblem(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const report = parseReport(formData);
  const error = validateReport(report);
  if (error) return { error };
  await prisma.problemReport.create({
    data: { kind: "RELATO", ...report, clinicId: user.clinicId, userId: user.id },
  });
  return { error: "", ok: "Recebemos o seu relato. Obrigado! Vamos olhar e, se precisar, entramos em contato." };
}

// Erro que aconteceu só no navegador (o servidor não ficou sabendo): a tela de erro avisa por aqui.
export async function reportBrowserError(message: string, page: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await recordError({
    message: `No navegador: ${String(message).slice(0, 900)}`,
    page: cleanPage(page),
    clinicId: user.clinicId,
    userId: user.id,
  });
}
