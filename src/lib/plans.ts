// Planos que a empresa vende às clínicas, módulos liberados por plano e controle da mensalidade.
// Sem acesso ao banco, para poder ser testado sozinho.

// Módulos que podem ficar de fora de um plano. O resto do sistema (agenda, pacientes,
// prontuário, recepção, servidores, auditoria...) faz parte de todos os planos.
export const MODULES = [
  { key: "financeiro", label: "Financeiro", tabs: ["financeiro", "meu-financeiro"] },
  { key: "contabilidade", label: "Contabilidade e trabalhista", tabs: ["contabilidade"] },
  { key: "assinatura", label: "Assinatura digital ICP-Brasil", tabs: ["assinatura"] },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export function moduleOfTab(tab: string): ModuleKey | null {
  return MODULES.find((m) => (m.tabs as readonly string[]).includes(tab))?.key ?? null;
}

// Gestão da clínica: no hospital estes módulos ficam de fora, mesmo que o plano os tenha.
export const CLINIC_MANAGEMENT_MODULES: ModuleKey[] = ["financeiro", "contabilidade"];

// Módulos que valem para a instituição: os do plano (sem plano, todos) menos a gestão, se for hospital.
// Clínica devolve exatamente o do plano, para nada mudar nela.
export function institutionModules(kind: string | null | undefined, planModules: string[] | null | undefined) {
  if (kind !== "HOSPITAL") return planModules ?? null;
  return (planModules ?? MODULES.map((m) => m.key)).filter((m) => !(CLINIC_MANAGEMENT_MODULES as string[]).includes(m));
}

// modules null = clínica sem plano (ex.: demonstração): tudo liberado.
export function tabInPlan(modules: string[] | null | undefined, tab: string) {
  if (!modules) return true;
  const mod = moduleOfTab(tab);
  return !mod || modules.includes(mod);
}

export function sanitizeModules(keys: string[]) {
  return MODULES.filter((m) => keys.includes(m.key)).map((m) => m.key);
}

// Dias de tolerância depois do vencimento antes de o acesso ser suspenso sozinho.
export const GRACE_DAYS = 10;
// A partir de quantos dias antes do vencimento o gerente da clínica recebe o aviso.
export const WARN_DAYS = 5;

export type BillingStatus =
  | { kind: "sem-controle" }
  | { kind: "em-dia"; daysLeft: number }
  | { kind: "vence-logo"; daysLeft: number }
  | { kind: "atrasada"; daysLate: number; daysToBlock: number }
  | { kind: "bloqueada"; daysLate: number };

const DAY = 24 * 3600 * 1000;

// Dia de hoje no horário de Brasília, à meia-noite UTC (mesmo formato das datas @db.Date).
export function todayDate(now = new Date()) {
  const br = new Date(now.getTime() - 3 * 3600 * 1000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate()));
}

// paidUntil: último dia coberto pela mensalidade paga. Vazio = a empresa não controla o pagamento desta clínica.
export function billingStatus(paidUntil: Date | null | undefined, today = todayDate()): BillingStatus {
  if (!paidUntil) return { kind: "sem-controle" };
  const diff = Math.round((paidUntil.getTime() - today.getTime()) / DAY);
  if (diff >= 0) return diff <= WARN_DAYS ? { kind: "vence-logo", daysLeft: diff } : { kind: "em-dia", daysLeft: diff };
  const daysLate = -diff;
  if (daysLate > GRACE_DAYS) return { kind: "bloqueada", daysLate };
  return { kind: "atrasada", daysLate, daysToBlock: GRACE_DAYS - daysLate + 1 };
}

// Clínica sem acesso: suspensa à mão no painel ou com a mensalidade atrasada além da tolerância.
export function clinicBlocked(clinic: { active: boolean; paidUntil?: Date | null }, today = todayDate()) {
  if (!clinic.active) return "suspensa" as const;
  if (billingStatus(clinic.paidUntil, today).kind === "bloqueada") return "atrasada" as const;
  return null;
}

// Registrar um pagamento estende a mensalidade um mês a partir do vencimento (ou de hoje, se estava vencida há muito).
export function nextPaidUntil(paidUntil: Date | null | undefined, today = todayDate()) {
  const base = paidUntil && paidUntil.getTime() >= today.getTime() - GRACE_DAYS * DAY ? paidUntil : today;
  const next = new Date(base);
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + 1);
  // 31/01 + 1 mês = 28/02 (e não 03/03).
  if (next.getUTCDate() !== day) next.setUTCDate(0);
  return next;
}

export function billingLabel(status: BillingStatus) {
  switch (status.kind) {
    case "sem-controle":
      return "Sem controle";
    case "em-dia":
      return `Em dia (${status.daysLeft} dias)`;
    case "vence-logo":
      return status.daysLeft === 0 ? "Vence hoje" : `Vence em ${status.daysLeft} dia${status.daysLeft > 1 ? "s" : ""}`;
    case "atrasada":
      return `Atrasada ${status.daysLate} dia${status.daysLate > 1 ? "s" : ""}`;
    case "bloqueada":
      return `Bloqueada (${status.daysLate} dias de atraso)`;
  }
}
