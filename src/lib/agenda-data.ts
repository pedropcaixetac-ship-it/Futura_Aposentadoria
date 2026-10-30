// Leituras da agenda no banco de dados.
import { prisma } from "./db";
import { clinicTime, freeSlots, occupiesSlot, overlaps, weekdayOf, type Interval } from "./agenda";

// Quem atende: profissionais de saúde ativos com registro em conselho.
export function listProfessionals(clinicId: string) {
  return prisma.user.findMany({
    where: { clinicId, active: true, role: { not: "RECEPCAO" }, councilNumber: { not: null } },
    select: { id: true, name: true, specialty: true },
    orderBy: { name: "asc" },
  });
}

export async function findProfessional(clinicId: string, id: string) {
  const list = await listProfessionals(clinicId);
  return list.find((p) => p.id === id) ?? null;
}

// Tudo o que a agenda mostra de um conjunto de profissionais entre duas datas (inclusive).
export async function loadAgenda(clinicId: string, professionalIds: string[], firstDate: string, lastDate: string) {
  const from = clinicTime(firstDate, 0);
  const to = clinicTime(lastDate, 24 * 60);
  const [workHours, blocks, appointments] = await Promise.all([
    prisma.workHours.findMany({ where: { clinicId, professionalId: { in: professionalIds } }, orderBy: { startMinute: "asc" } }),
    prisma.scheduleBlock.findMany({
      where: { clinicId, professionalId: { in: professionalIds }, startsAt: { lt: to }, endsAt: { gt: from } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: { clinicId, professionalId: { in: professionalIds }, startsAt: { lt: to }, endsAt: { gt: from } },
      include: { patient: { select: { id: true, name: true, socialName: true, phone: true, phoneWhatsapp: true, whatsappOptIn: true } } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  return { workHours, blocks, appointments };
}

export type AgendaData = Awaited<ReturnType<typeof loadAgenda>>;

// Recorte de um profissional num dia, já com os horários livres calculados.
export function columnFor(data: AgendaData, professionalId: string, date: string) {
  const day = { start: clinicTime(date, 0), end: clinicTime(date, 24 * 60) };
  const inDay = (i: Interval) => overlaps(i, day);
  const periods = data.workHours.filter((w) => w.professionalId === professionalId && w.weekday === weekdayOf(date));
  const blocks = data.blocks
    .filter((b) => b.professionalId === professionalId)
    .map((b) => ({ ...b, start: b.startsAt, end: b.endsAt }))
    .filter(inDay);
  const appointments = data.appointments
    .filter((a) => a.professionalId === professionalId)
    .map((a) => ({ ...a, start: a.startsAt, end: a.endsAt }))
    .filter(inDay);
  const active = appointments.filter((a) => occupiesSlot(a.status));
  return {
    periods,
    blocks,
    appointments: active,
    cancelled: appointments.filter((a) => !occupiesSlot(a.status)),
    free: freeSlots(date, periods, [...active, ...blocks]),
  };
}

export type AgendaColumn = ReturnType<typeof columnFor>;
