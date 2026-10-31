// Manutenção e infraestrutura do hospital: chamados e preventiva dos equipamentos.

export const WORK_CATEGORIES = [
  "Equipamento médico",
  "Elétrica",
  "Hidráulica",
  "Gases medicinais",
  "Climatização",
  "Predial (portas, pintura, móveis)",
  "Gerador e energia",
  "Informática e telefone",
  "Outros",
];

export const workStatusLabel: Record<string, string> = {
  ABERTO: "Aberto",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

export const workStatusStyle: Record<string, string> = {
  ABERTO: "bg-amber-100 text-amber-800",
  EM_ANDAMENTO: "bg-marinho-100 text-marinho-800",
  CONCLUIDO: "bg-emerald-100 text-emerald-800",
  CANCELADO: "bg-slate-200 text-slate-600",
};

const DAY = 24 * 60 * 60 * 1000;

export type PreventiveState = "SEM_PLANO" | "VENCIDA" | "VENCE_EM_BREVE" | "OK";

// Próxima preventiva: a última mais o intervalo; sem nenhuma feita, vence já (o equipamento nunca foi revisado).
export function preventiveDue(e: { preventiveDays: number | null; lastPreventiveAt: Date | null; createdAt: Date }, now = new Date()) {
  if (!e.preventiveDays) return { state: "SEM_PLANO" as PreventiveState, dueAt: null };
  const dueAt = new Date((e.lastPreventiveAt ?? e.createdAt).getTime() + e.preventiveDays * DAY);
  const left = dueAt.getTime() - now.getTime();
  const state: PreventiveState = left < 0 ? "VENCIDA" : left <= 7 * DAY ? "VENCE_EM_BREVE" : "OK";
  return { state, dueAt };
}

// Fila da manutenção: equipamento parado e urgente primeiro, depois o mais antigo.
export function workOrderOrder(a: { urgent: boolean; stopped: boolean; createdAt: Date }, b: { urgent: boolean; stopped: boolean; createdAt: Date }) {
  const weight = (w: { urgent: boolean; stopped: boolean }) => (w.urgent ? 2 : 0) + (w.stopped ? 1 : 0);
  return weight(b) - weight(a) || a.createdAt.getTime() - b.createdAt.getTime();
}

// "há 3 h", "há 2 dias": quanto tempo o chamado está esperando.
export function waitingLabel(since: Date, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days > 1 ? "s" : ""}`;
}
