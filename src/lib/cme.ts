// Regras da CME (esterilização e rastreabilidade), sem acesso ao banco, para poderem ser testadas sozinhas.
import type { LoadResult, SterilizationMethod } from "@prisma/client";

export const methodLabel: Record<SterilizationMethod, string> = { VAPOR: "Vapor (autoclave)", PEROXIDO: "Peróxido de hidrogênio (plasma)", OXIDO_ETILENO: "Óxido de etileno" };

export const loadResultLabel: Record<LoadResult, string> = { PENDENTE: "Aguardando indicadores", LIBERADA: "Liberada", REPROVADA: "Reprovada", RECOLHIDA: "Recolhida" };

export type PackageState = "AGUARDANDO" | "DISPONIVEL" | "VENCE_EM_BREVE" | "VENCIDO" | "USADO" | "DESCARTADO" | "BLOQUEADO";

export const packageStateLabel: Record<PackageState, string> = {
  AGUARDANDO: "Aguardando liberação da carga",
  DISPONIVEL: "Disponível",
  VENCE_EM_BREVE: "Vence em até 3 dias",
  VENCIDO: "Vencido (reprocessar)",
  USADO: "Usado",
  DESCARTADO: "Descartado",
  BLOQUEADO: "Carga reprovada ou recolhida",
};

const DAY = 24 * 3600_000;

// Situação do pacote: só está disponível se a carga foi liberada e a validade não passou.
export function packageState(pkg: { expiresAt: Date; usedAt: Date | null; discardedAt: Date | null }, load: { result: LoadResult }, now = new Date()): PackageState {
  if (pkg.usedAt) return "USADO";
  if (pkg.discardedAt) return "DESCARTADO";
  if (load.result === "REPROVADA" || load.result === "RECOLHIDA") return "BLOQUEADO";
  if (load.result === "PENDENTE") return "AGUARDANDO";
  if (pkg.expiresAt.getTime() < now.getTime()) return "VENCIDO";
  return pkg.expiresAt.getTime() - now.getTime() <= 3 * DAY ? "VENCE_EM_BREVE" : "DISPONIVEL";
}

export function usable(state: PackageState) {
  return state === "DISPONIVEL" || state === "VENCE_EM_BREVE";
}

// Validade: conta a partir do dia da esterilização, até o fim do último dia (Brasília).
export function packageExpiry(sterilizedAt: Date, validityDays: number) {
  const local = new Date(sterilizedAt.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + validityDays, 23, 59, 59) + 3 * 3600_000);
}

// Código da carga: equipamento curto + data + número do ciclo do dia (ex.: AC1-20261031-02).
export function loadCode(equipment: string, at: Date, sequence: number) {
  const local = new Date(at.getTime() - 3 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
  const tag = equipment.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "CME";
  return `${tag}-${local}-${String(sequence).padStart(2, "0")}`;
}
