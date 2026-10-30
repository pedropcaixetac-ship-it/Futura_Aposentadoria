import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { canViewClinical } from "./permissions";

// Prontuário completo de um paciente: todos os atendimentos finalizados, do mais
// antigo para o mais recente. Quem tem acesso restrito só vê os próprios.
export async function loadProntuario(user: CurrentUser, patientId: string) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } });
  if (!patient) return null;
  const encounters = await prisma.encounter.findMany({
    where: {
      patientId,
      clinicId: user.clinicId,
      status: "FINALIZADO",
      ...(!canViewClinical(user) && { professionalId: user.id }),
    },
    include: {
      professional: true,
      addenda: { include: { author: true }, orderBy: { createdAt: "asc" } },
      documents: { select: { type: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      signedPdf: { select: { signerName: true, signedAt: true, provider: true } },
    },
    orderBy: { startedAt: "asc" },
  });
  return { patient, encounters };
}

export type Prontuario = NonNullable<Awaited<ReturnType<typeof loadProntuario>>>;
