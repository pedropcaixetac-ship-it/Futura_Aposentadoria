import { prisma } from "./db";

// Dados do PDF do prontuário completo: o paciente, todos os atendimentos
// finalizados, do mais antigo ao mais recente, e os laudos emitidos fora de
// atendimento. Usado no PDF e na assinatura.
export async function loadRecordForPdf(clinicId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId } });
  if (!patient) return null;
  const encounters = await prisma.encounter.findMany({
    where: { patientId, clinicId, status: "FINALIZADO" },
    include: {
      professional: true,
      addenda: { include: { author: true }, orderBy: { createdAt: "asc" } },
      documents: { orderBy: { createdAt: "asc" } },
      signedPdf: { select: { signerName: true, signedAt: true, provider: true } },
    },
    orderBy: { startedAt: "asc" },
  });
  const documents = await prisma.clinicalDocument.findMany({
    where: { patientId, clinicId, encounterId: null },
    include: { author: true },
    orderBy: { createdAt: "asc" },
  });
  return { patient, encounters, documents };
}
