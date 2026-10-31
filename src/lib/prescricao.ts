// Regras da prescrição hospitalar e da checagem, sem acesso ao banco, para poderem ser testadas sozinhas.
import type { CheckStatus, PrescriptionKind } from "@prisma/client";

export const kindLabel: Record<PrescriptionKind, string> = { MEDICAMENTO: "Medicamento", CUIDADO: "Cuidado", DIETA: "Dieta" };

export const ROUTES = ["Oral", "Endovenosa (EV)", "Intramuscular (IM)", "Subcutânea (SC)", "Sublingual (SL)", "Inalatória", "Tópica", "Retal", "Sonda", "Outra"];

// "Frequência" do formulário: dose única, se necessário ou de x em x horas.
export const FREQUENCIES: { value: string; label: string; intervalHours: number | null; asNeeded: boolean }[] = [
  { value: "unica", label: "Dose única (agora)", intervalHours: null, asNeeded: false },
  { value: "sn", label: "Se necessário", intervalHours: null, asNeeded: true },
  { value: "1", label: "De 1 em 1 hora", intervalHours: 1, asNeeded: false },
  { value: "2", label: "De 2 em 2 horas", intervalHours: 2, asNeeded: false },
  { value: "4", label: "De 4 em 4 horas", intervalHours: 4, asNeeded: false },
  { value: "6", label: "De 6 em 6 horas", intervalHours: 6, asNeeded: false },
  { value: "8", label: "De 8 em 8 horas", intervalHours: 8, asNeeded: false },
  { value: "12", label: "De 12 em 12 horas", intervalHours: 12, asNeeded: false },
  { value: "24", label: "Uma vez ao dia", intervalHours: 24, asNeeded: false },
];

export function frequencyLabel(item: { intervalHours: number | null; asNeeded: boolean }) {
  if (item.asNeeded) return "se necessário";
  if (item.intervalHours === null) return "dose única";
  if (item.intervalHours === 24) return "1x ao dia";
  return `de ${item.intervalHours}/${item.intervalHours}h`;
}

type Schedulable = { startAt: Date; endAt: Date | null; suspendedAt: Date | null; intervalHours: number | null; asNeeded: boolean };

// Até quando o item vale: o que vier primeiro entre o fim previsto e a suspensão.
function activeUntil(item: Schedulable) {
  const ends = [item.endAt, item.suspendedAt].filter((d): d is Date => !!d).map((d) => d.getTime());
  return ends.length ? Math.min(...ends) : Infinity;
}

// Horários de aplicação entre "from" (incluído) e "to" (excluído). "Se necessário" não tem horário.
export function doseTimes(item: Schedulable, from: Date, to: Date): Date[] {
  if (item.asNeeded) return [];
  const start = item.startAt.getTime();
  const until = Math.min(activeUntil(item), to.getTime());
  if (item.intervalHours === null) return start >= from.getTime() && start < until ? [item.startAt] : [];
  const step = item.intervalHours * 3600_000;
  const times: Date[] = [];
  let t = start >= from.getTime() ? start : start + Math.ceil((from.getTime() - start) / step) * step;
  for (; t < until && times.length < 200; t += step) times.push(new Date(t));
  return times;
}

// O horário é mesmo um dos horários da prescrição? Evita checar a mesma dose de novo com outro horário
// (tela antiga aberta, horário digitado com segundos a mais) ou uma dose de antes do início.
export function isDoseTime(item: Schedulable, at: Date) {
  return doseTimes(item, at, new Date(at.getTime() + 1)).some((t) => t.getTime() === at.getTime());
}

export function isActive(item: Schedulable, at = new Date()) {
  return item.startAt.getTime() <= at.getTime() + 24 * 3600_000 && at.getTime() < activeUntil(item);
}

// Situação de um horário: checado, atrasado (passou 30 min sem checagem), na hora (até 30 min) ou depois.
export type DoseState = CheckStatus | "ATRASADO" | "AGORA" | "PREVISTO";
export function doseState(scheduledAt: Date, check: { status: CheckStatus } | undefined, now = new Date()): DoseState {
  if (check) return check.status;
  const diff = now.getTime() - scheduledAt.getTime();
  if (diff > 30 * 60_000) return "ATRASADO";
  if (diff >= -30 * 60_000) return "AGORA";
  return "PREVISTO";
}

// Pronto-socorro: quantas doses já deviam ter sido feitas e quantas foram checadas.
// Tudo checado = paciente aguardando a reavaliação do médico.
export function medicationProgress(
  items: (Schedulable & { checks: { scheduledAt: Date | null; canceledAt: Date | null }[] })[],
  now = new Date(),
) {
  let due = 0;
  let done = 0;
  for (const item of items) {
    const times = doseTimes(item, new Date(0), new Date(now.getTime() + 30 * 60_000));
    const checked = new Set(item.checks.filter((c) => !c.canceledAt && c.scheduledAt).map((c) => c.scheduledAt!.getTime()));
    due += times.length;
    done += times.filter((t) => checked.has(t.getTime())).length;
  }
  return { due, done, waitingReview: due > 0 && done === due };
}

// ---- Prescrição do dia ----
// O médico faz a prescrição do dia na visita. Ela vale até as 12h do dia seguinte (horário de Brasília),
// para cobrir a manhã até a próxima visita. Cada prescrição pertence ao dia (data) em que foi feita.

const DAY_MS = 24 * 3600_000;
const BRT = 3 * 3600_000;

// Meia-noite (de Brasília) do dia de "at".
export function localMidnight(at: Date) {
  const local = new Date(at.getTime() - BRT);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + BRT);
}

// "2026-10-31" do dia que começa em "midnight".
export function dayKey(midnight: Date) {
  return new Date(midnight.getTime() - BRT).toISOString().slice(0, 10);
}

// Meia-noite do dia "2026-10-31". Texto inválido = null.
export function dayFromKey(key: string | undefined | null) {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(`${key}T03:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Até quando vale um item prescrito com início em startAt: 12h do dia seguinte.
export function prescriptionDayEnd(startAt: Date) {
  return new Date(localMidnight(startAt).getTime() + DAY_MS + 12 * 3600_000);
}

// Dia da prescrição a que o item pertence (meia-noite): o dia anterior ao vencimento das 12h.
// Itens antigos (de antes da prescrição do dia) contam pelo início.
export function prescriptionDayOf(item: { startAt: Date; endAt: Date | null }) {
  const daily = item.endAt ? localMidnight(new Date(item.endAt.getTime() - DAY_MS - 1)) : null;
  return daily && daily.getTime() + DAY_MS + 12 * 3600_000 === item.endAt!.getTime() && item.startAt < item.endAt! ? daily : localMidnight(item.startAt);
}

// Item da prescrição do dia (vence às 12h do dia seguinte e é renovado pelo médico)?
export function isDailyItem(item: { startAt: Date; endAt: Date | null }) {
  return item.endAt !== null && item.endAt.getTime() === prescriptionDayEnd(prescriptionDayOf(item)).getTime();
}

// Itens antigos (sem fim ou com duração em dias): aparecem em todo dia em que valiam.
function isOpenEnded(item: { startAt: Date; endAt: Date | null }) {
  return !isDailyItem(item);
}

// O item aparece na prescrição desse dia?
export function inDay(item: Schedulable, midnight: Date) {
  if (isOpenEnded(item)) {
    const end = midnight.getTime() + DAY_MS;
    if (!item.asNeeded && item.intervalHours === null) return item.startAt >= midnight && item.startAt.getTime() < end;
    return item.startAt.getTime() < end && activeUntil(item) > midnight.getTime();
  }
  return prescriptionDayOf(item).getTime() === midnight.getTime();
}

// Janela de horários do item para mostrar no dia: do início ao fim da validade
// (itens antigos, sem fim: só o próprio dia).
export function dayWindow(item: Schedulable, midnight: Date): [Date, Date] {
  if (isOpenEnded(item)) return [midnight, new Date(midnight.getTime() + DAY_MS)];
  return [item.startAt, item.endAt!];
}

// Lista de dias para a coluna ao lado, do mais recente ao mais antigo,
// do dia do primeiro item até hoje (ou até o último dia já prescrito).
export function prescriptionDays(items: Schedulable[], today: Date) {
  if (items.length === 0) return [];
  const daysOf = items.map((i) => prescriptionDayOf(i).getTime());
  const first = Math.min(...daysOf);
  const last = Math.max(today.getTime(), ...daysOf);
  const days: { key: string; start: Date; count: number }[] = [];
  // Passo de 24h com acerto pela meia-noite, por segurança.
  for (let t = last; t >= first && days.length < 400; t = localMidnight(new Date(t - DAY_MS / 2)).getTime()) {
    const start = new Date(t);
    days.push({ key: dayKey(start), start, count: items.filter((i) => inDay(i, start)).length });
  }
  return days;
}

type Repeatable = Schedulable & { kind: PrescriptionKind; description: string; dose: string | null; route: string | null };

const sameItem = (a: Repeatable, b: Repeatable) =>
  a.kind === b.kind && a.description === b.description && (a.dose ?? "") === (b.dose ?? "") && (a.route ?? "") === (b.route ?? "") &&
  a.intervalHours === b.intervalHours && a.asNeeded === b.asNeeded;

// O que dá para repetir da prescrição de ontem: o que não foi suspenso nem era dose única,
// e que ainda não está na prescrição de hoje.
export function repeatableFromPreviousDay<T extends Repeatable>(items: T[], today: Date): T[] {
  const yesterday = new Date(localMidnight(new Date(today.getTime() - DAY_MS / 2)));
  const todays = items.filter((i) => !isOpenEnded(i) && prescriptionDayOf(i).getTime() === today.getTime());
  return items.filter(
    (i) =>
      !isOpenEnded(i) &&
      prescriptionDayOf(i).getTime() === yesterday.getTime() &&
      (i.asNeeded || i.intervalHours !== null) &&
      !i.suspendedAt &&
      !todays.some((t) => sameItem(t, i)),
  );
}

// Início do item repetido: logo depois que o de ontem deixa de valer (12h), seguindo os mesmos horários,
// para não dar dose dobrada na manhã em que as duas prescrições se encontram.
export function repeatedStart(item: Schedulable) {
  const from = item.endAt ?? new Date();
  if (item.asNeeded || item.intervalHours === null) return from;
  const next = doseTimes({ ...item, endAt: null, suspendedAt: null }, from, new Date(from.getTime() + DAY_MS))[0];
  return next ?? from;
}

// Início do tratamento: com a prescrição renovada todo dia, o mesmo remédio vira um item novo a cada dia.
// Volta pelos itens anteriores do mesmo remédio, enquanto um emenda no outro (sem suspensão no meio).
export function treatmentStart(
  item: { description: string; startAt: Date },
  history: { description: string; startAt: Date; endAt: Date | null; suspendedAt: Date | null }[],
) {
  const same = history
    .filter((h) => h.description.trim().toLowerCase() === item.description.trim().toLowerCase() && !h.suspendedAt)
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  let start = item.startAt;
  for (const h of same) {
    if (h.startAt >= start) continue;
    const coveredUntil = h.endAt?.getTime() ?? Infinity;
    // Emenda se o anterior valia até perto do começo deste (o intervalo entre doses cabe em 24h).
    if (coveredUntil + DAY_MS >= start.getTime()) start = h.startAt;
    else break;
  }
  return start;
}
