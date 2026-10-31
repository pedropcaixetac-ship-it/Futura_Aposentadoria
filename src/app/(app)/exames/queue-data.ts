import type { ExamSector, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { queueOrder } from "@/lib/exames";

const people = { select: { name: true, sex: true, jobTitle: true } } as const;

const include = {
  patient: { select: { name: true, socialName: true, birthDate: true, allergies: true } },
  examType: true,
  admission: { select: { bed: { select: { code: true, ward: { select: { name: true } } } } } },
  emergencyVisit: { select: { id: true } },
  requestedBy: people,
  collectedBy: people,
  resultBy: people,
} as const;

// Quantos de cada lista aparecem de uma vez. Num hospital cheio são milhares de exames por dia:
// a fila mostra os primeiros (urgentes e mais antigos antes) e o resto aparece conforme a fila anda.
export const QUEUE_LIMIT = 60;
export const RELEASED_LIMIT = 40;

// Fila de um setor: o que falta coletar/realizar, o que falta liberar e o que saiu nas últimas 24 horas.
// "ala" filtra pelo lugar do paciente: id da ala, "ps" (pronto-socorro) ou "externo" (ambulatorial).
export async function loadQueue(clinicId: string, sector: ExamSector, until: Date, ala = "") {
  const place: Prisma.ExamRequestWhereInput =
    ala === "ps" ? { emergencyVisitId: { not: null } } : ala === "externo" ? { admissionId: null, emergencyVisitId: null } : ala ? { admission: { bed: { wardId: ala } } } : {};
  const base: Prisma.ExamRequestWhereInput = { clinicId, examType: { sector }, ...place };
  const collectWhere: Prisma.ExamRequestWhereInput = { ...base, OR: [{ status: "SOLICITADO" }, { status: "AGENDADO", scheduledAt: { lt: until } }] };
  const releaseWhere: Prisma.ExamRequestWhereInput = { ...base, status: "COLETADO" };
  const releasedWhere: Prisma.ExamRequestWhereInput = { ...base, status: "LAUDADO", resultAt: { gte: new Date(Date.now() - 24 * 3600_000) } };
  const order = { priority: true, scheduledAt: true, createdAt: true, id: true } as const;
  // A ordem da fila (urgente primeiro, depois o horário) é calculada com poucos campos; só os primeiros vêm completos.
  const [collectKeys, releaseKeys, released, releasedCount] = await Promise.all([
    prisma.examRequest.findMany({ where: { ...collectWhere, clinicId }, select: order }),
    prisma.examRequest.findMany({ where: { ...releaseWhere, clinicId }, select: order }),
    prisma.examRequest.findMany({ where: { ...releasedWhere, clinicId }, include, orderBy: { resultAt: "desc" }, take: RELEASED_LIMIT }),
    prisma.examRequest.count({ where: { ...releasedWhere, clinicId } }),
  ]);
  const firstIds = (keys: typeof collectKeys) => [...keys].sort(queueOrder).slice(0, QUEUE_LIMIT).map((k) => k.id);
  const load = async (ids: string[]) => {
    const rows = await prisma.examRequest.findMany({ where: { clinicId, id: { in: ids } }, include });
    return rows.sort(queueOrder);
  };
  const [toCollect, toRelease] = await Promise.all([load(firstIds(collectKeys)), load(firstIds(releaseKeys))]);
  return {
    toCollect,
    toRelease,
    released,
    counts: { toCollect: collectKeys.length, toRelease: releaseKeys.length, released: releasedCount },
  };
}

export type QueueExam = Awaited<ReturnType<typeof loadQueue>>["toCollect"][number];

export function whereLabel(e: QueueExam) {
  if (e.admission) return `${e.admission.bed.ward.name} · leito ${e.admission.bed.code}`;
  if (e.emergencyVisit) return "Pronto-socorro";
  return "Ambulatorial";
}

// Filtro de ala das telas do laboratório e da imagem.
export async function queueWards(clinicId: string) {
  return prisma.ward.findMany({ where: { clinicId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
