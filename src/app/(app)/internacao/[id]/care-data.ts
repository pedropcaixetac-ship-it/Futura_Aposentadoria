import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { canWorkClinical } from "@/lib/permissions";

// Internação com o que o cabeçalho das abas de cuidado mostra. Só para profissionais de saúde.
export async function loadAdmissionForCare(user: CurrentUser, id: string) {
  if (!canWorkClinical(user)) notFound();
  const admission = await prisma.admission.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { patient: { select: { name: true, socialName: true, allergies: true } }, bed: { include: { ward: { select: { name: true } } } } },
  });
  if (!admission) notFound();
  return admission;
}

// Data e hora de agora em Brasília, no formato do campo datetime-local.
export function nowLocal() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 16);
}
