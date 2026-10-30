// Horários livres que o paciente pode escolher no aplicativo.
// Usa a mesma conta da agenda da clínica (horários de atendimento, bloqueios e consultas já marcadas).
import { prisma } from "./db";
import { addDays, clinicParts, today } from "./agenda";
import { columnFor, listProfessionals, loadAgenda } from "./agenda-data";
import { BOOKING_DAYS, bookable } from "./patient-app";

// Só aparecem profissionais que têm horário de atendimento cadastrado.
export async function bookableProfessionals(clinicId: string) {
  const [list, hours] = await Promise.all([
    listProfessionals(clinicId),
    prisma.workHours.findMany({ where: { clinicId }, select: { professionalId: true }, distinct: ["professionalId"] }),
  ]);
  const withHours = new Set(hours.map((h) => h.professionalId));
  return list.filter((p) => withHours.has(p.id));
}

// Dias dos próximos BOOKING_DAYS com pelo menos um horário livre, já com os horários.
export async function availableDays(clinicId: string, professionalId: string, now = new Date()) {
  const first = today();
  const last = addDays(first, BOOKING_DAYS - 1);
  const data = await loadAgenda(clinicId, [professionalId], first, last);
  const days: { date: string; slots: { start: Date; end: Date }[] }[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const slots = bookable(columnFor(data, professionalId, date).free, now);
    if (slots.length) days.push({ date, slots });
  }
  return days;
}

// Confere, na hora de gravar, que o horário escolhido continua livre.
export async function findFreeSlot(clinicId: string, professionalId: string, start: Date, now = new Date()) {
  if (Number.isNaN(start.getTime())) return null;
  const date = clinicParts(start).date;
  const data = await loadAgenda(clinicId, [professionalId], date, date);
  return bookable(columnFor(data, professionalId, date).free, now).find((s) => s.start.getTime() === start.getTime()) ?? null;
}
