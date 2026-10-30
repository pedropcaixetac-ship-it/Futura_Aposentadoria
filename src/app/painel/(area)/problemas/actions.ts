"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { platformAudit, requirePlatformUser } from "@/lib/painel-auth";

// Resolvido sai da lista "Abertos". Se o mesmo erro voltar depois, ele aparece de novo como uma linha nova.
export async function setProblemResolved(id: string, resolved: boolean) {
  const owner = await requirePlatformUser();
  const problem = await prisma.problemReport.update({ where: { id }, data: { resolvedAt: resolved ? new Date() : null } });
  await platformAudit({
    userId: owner.id,
    action: resolved ? "PROBLEMA_RESOLVIDO" : "PROBLEMA_REABERTO",
    clinicId: problem.clinicId,
    details: { problema: id },
  });
  revalidatePath("/painel", "layout");
}
