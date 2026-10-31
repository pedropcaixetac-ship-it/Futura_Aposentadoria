import type { ExamSector } from "@prisma/client";
import { prisma } from "@/lib/db";
import { queueOrder } from "@/lib/exames";

const people = { select: { name: true, sex: true, jobTitle: true } } as const;

// Fila de um setor: o que falta coletar/realizar, o que falta liberar e o que saiu nas últimas 24 horas.
export async function loadQueue(clinicId: string, sector: ExamSector, until: Date) {
  const exams = await prisma.examRequest.findMany({
    where: {
      clinicId,
      examType: { sector },
      OR: [
        { status: "SOLICITADO" },
        { status: "AGENDADO", scheduledAt: { lt: until } },
        { status: "COLETADO" },
        { status: "LAUDADO", resultAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
      ],
    },
    include: {
      patient: { select: { name: true, socialName: true, birthDate: true, allergies: true } },
      examType: true,
      admission: { select: { bed: { select: { code: true, ward: { select: { name: true } } } } } },
      emergencyVisit: { select: { id: true } },
      requestedBy: people,
      collectedBy: people,
      resultBy: people,
    },
  });
  const sorted = [...exams].sort(queueOrder);
  return {
    toCollect: sorted.filter((e) => e.status === "SOLICITADO" || e.status === "AGENDADO"),
    toRelease: sorted.filter((e) => e.status === "COLETADO"),
    released: exams.filter((e) => e.status === "LAUDADO").sort((a, b) => b.resultAt!.getTime() - a.resultAt!.getTime()),
  };
}

export type QueueExam = Awaited<ReturnType<typeof loadQueue>>["toCollect"][number];

export function whereLabel(e: QueueExam) {
  if (e.admission) return `${e.admission.bed.ward.name} · leito ${e.admission.bed.code}`;
  if (e.emergencyVisit) return "Pronto-socorro";
  return "Ambulatorial";
}
