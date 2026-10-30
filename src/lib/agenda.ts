// Regras e contas da agenda que não dependem do banco de dados.
import type { AppointmentStatus, AppointmentType } from "@prisma/client";

// Horário de Brasília. O Brasil não tem horário de verão desde 2019, então a
// diferença para o UTC é sempre de 3 horas.
const OFFSET_MINUTES = -3 * 60;
const DAY = 24 * 60;

export type Interval = { start: Date; end: Date };

// "2026-10-30" + 510 minutos (8h30) no horário de Brasília -> instante exato.
export function clinicTime(date: string, minutes: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + (minutes - OFFSET_MINUTES) * 60_000);
}

// Instante exato -> data e minutos do dia no horário de Brasília.
export function clinicParts(instant: Date) {
  const local = new Date(instant.getTime() + OFFSET_MINUTES * 60_000);
  return {
    date: local.toISOString().slice(0, 10),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    weekday: local.getUTCDay(),
  };
}

export function today() {
  return clinicParts(new Date()).date;
}

export function isValidDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY * 60_000).toISOString().slice(0, 10);
}

export function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// Segunda-feira da semana da data.
export function startOfWeek(date: string) {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

export function formatMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// "08:30" -> 510. Devolve null se não for um horário válido.
export function parseMinutes(value: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) < 24 && Number(m[2]) < 60 ? minutes : null;
}

export function formatTime(instant: Date) {
  return formatMinutes(clinicParts(instant).minutes);
}

const weekdayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function weekdayName(weekday: number) {
  return weekdayNames[weekday];
}

// "Sexta, 30 out"
export function formatDayLabel(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${weekdayNames[weekdayOf(date)]}, ${day} ${monthNames[month - 1]}`;
}

export function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && b.start < a.end;
}

// Agendamentos desmarcados liberam o horário.
export function occupiesSlot(status: AppointmentStatus) {
  return status !== "DESMARCADO";
}

export type WorkPeriod = { startMinute: number; endMinute: number; slotMinutes: number };

// Horários livres do dia: cada período de atendimento dividido pela duração
// padrão, sem os que batem com consultas já marcadas ou bloqueios.
export function freeSlots(date: string, periods: WorkPeriod[], busy: Interval[]): Interval[] {
  const slots: Interval[] = [];
  for (const p of periods) {
    for (let m = p.startMinute; m + p.slotMinutes <= p.endMinute; m += p.slotMinutes) {
      const slot = { start: clinicTime(date, m), end: clinicTime(date, m + p.slotMinutes) };
      if (!busy.some((b) => overlaps(slot, b))) slots.push(slot);
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// Encaixes ficam lado a lado na tela: cada item recebe uma faixa (lane) e o
// total de faixas do grupo de horários que se sobrepõem.
export function layoutLanes<T extends Interval>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const result: { item: T; lane: number; lanes: number }[] = [];
  let group: { item: T; lane: number; lanes: number }[] = [];
  let laneEnds: Date[] = [];
  let groupEnd = 0;

  const closeGroup = () => {
    for (const g of group) g.lanes = laneEnds.length;
    result.push(...group);
    group = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (group.length && item.start.getTime() >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(item.end) - 1;
    else laneEnds[lane] = item.end;
    group.push({ item, lane, lanes: 0 });
    groupEnd = Math.max(groupEnd, item.end.getTime());
  }
  closeGroup();
  return result;
}

export const appointmentTypeLabel: Record<AppointmentType, string> = {
  CONSULTA: "Consulta",
  RETORNO: "Retorno",
  PROCEDIMENTO: "Procedimento",
  TELECONSULTA: "Teleconsulta",
};

export const statusLabel: Record<AppointmentStatus, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  CHEGOU: "Chegou",
  EM_ATENDIMENTO: "Em atendimento",
  ATENDIDO: "Atendido",
  FALTOU: "Faltou",
  DESMARCADO: "Desmarcado",
};

// Cores de cada situação: fundo, borda e texto.
export const statusStyle: Record<AppointmentStatus, string> = {
  AGENDADO: "bg-marinho-50 border-marinho-400 text-marinho-900",
  CONFIRMADO: "bg-emerald-50 border-emerald-500 text-emerald-900",
  CHEGOU: "bg-amber-50 border-amber-500 text-amber-900",
  EM_ATENDIMENTO: "bg-violet-50 border-violet-500 text-violet-900",
  ATENDIDO: "bg-slate-100 border-slate-400 text-slate-600",
  FALTOU: "bg-red-50 border-red-400 text-red-800",
  DESMARCADO: "bg-slate-50 border-slate-300 text-slate-400 line-through",
};

// Situações que a recepção pode marcar à mão a partir de cada situação.
// "Em atendimento" e "Atendido" vêm do prontuário.
export function nextStatuses(status: AppointmentStatus): AppointmentStatus[] {
  switch (status) {
    case "AGENDADO":
      return ["CONFIRMADO", "CHEGOU", "FALTOU"];
    case "CONFIRMADO":
      return ["CHEGOU", "FALTOU", "AGENDADO"];
    case "CHEGOU":
      return ["CONFIRMADO"];
    case "FALTOU":
      return ["CHEGOU", "AGENDADO"];
    case "DESMARCADO":
      return ["AGENDADO"];
    default:
      return [];
  }
}

export function canCancel(status: AppointmentStatus) {
  return status === "AGENDADO" || status === "CONFIRMADO" || status === "CHEGOU" || status === "FALTOU";
}
