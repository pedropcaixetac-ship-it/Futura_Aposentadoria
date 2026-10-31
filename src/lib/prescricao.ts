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
