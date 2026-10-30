import { prisma } from "@/lib/db";
import { addDays, today } from "@/lib/agenda";

// Quantos dias antes da data prevista o retorno já aparece para a recepção avisar,
// e por quantos dias depois ele continua na lista se ninguém marcar.
export const RETURN_NOTICE_DAYS_BEFORE = 14;
const RETURN_NOTICE_DAYS_AFTER = 60;

// Retornos previstos para as próximas semanas cujo paciente ainda não tem
// outra consulta marcada com o mesmo profissional.
export async function returnsToNotify(clinicId: string) {
  const now = today();
  const due = await prisma.appointment.findMany({
    where: {
      clinicId,
      status: { not: "DESMARCADO" },
      returnDueOn: {
        gte: new Date(`${addDays(now, -RETURN_NOTICE_DAYS_AFTER)}T00:00:00Z`),
        lte: new Date(`${addDays(now, RETURN_NOTICE_DAYS_BEFORE)}T00:00:00Z`),
      },
    },
    include: {
      patient: { select: { id: true, name: true, socialName: true, phone: true, phoneWhatsapp: true, whatsappOptIn: true } },
      professional: { select: { id: true, name: true, jobTitle: true, sex: true } },
    },
    orderBy: { returnDueOn: "asc" },
  });
  if (due.length === 0) return [];

  const later = await prisma.appointment.findMany({
    where: {
      clinicId,
      status: { not: "DESMARCADO" },
      patientId: { in: due.map((d) => d.patientId) },
      startsAt: { gt: new Date(Math.min(...due.map((d) => d.startsAt.getTime()))) },
    },
    select: { patientId: true, professionalId: true, startsAt: true },
  });
  return due.filter(
    (d) => !later.some((l) => l.patientId === d.patientId && l.professionalId === d.professionalId && l.startsAt > d.startsAt),
  );
}
