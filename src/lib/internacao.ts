// Regras da internação e do mapa de leitos (versão hospitalar), sem acesso ao banco,
// para poderem ser testadas sozinhas.
import type { BedStatus, DischargeKind } from "@prisma/client";

export const WARD_KINDS = ["Enfermaria", "UTI adulto", "UTI pediátrica", "UTI neonatal", "Apartamento", "Pronto-socorro (observação)", "Outro"];

export const ADMISSION_ORIGINS = ["Pronto-socorro", "Ambulatório", "Eletiva (internação marcada)", "Transferência de outro hospital", "Centro cirúrgico", "Outra"];

export const dischargeKindLabel: Record<DischargeKind, string> = {
  MELHORADO: "Alta melhorado",
  A_PEDIDO: "Alta a pedido",
  TRANSFERENCIA: "Transferência para outro hospital",
  OBITO: "Óbito",
  EVASAO: "Evasão",
};

// Situação do leito no mapa: ocupado vem da internação sem alta; o resto vem do próprio leito.
export type BedState = "OCUPADO" | BedStatus;

export const bedStateLabel: Record<BedState, string> = {
  OCUPADO: "Ocupado",
  LIVRE: "Livre",
  LIMPEZA: "Em limpeza",
  BLOQUEADO: "Bloqueado",
};

export function bedState(bed: { status: BedStatus }, occupied: boolean): BedState {
  return occupied ? "OCUPADO" : bed.status;
}

// Ocupação: leitos bloqueados não contam, porque não estão disponíveis para uso.
export function occupancy(states: BedState[]) {
  const count = (s: BedState) => states.filter((x) => x === s).length;
  const ocupados = count("OCUPADO");
  const disponiveis = states.length - count("BLOQUEADO");
  return {
    total: states.length,
    ocupados,
    livres: count("LIVRE"),
    limpeza: count("LIMPEZA"),
    bloqueados: count("BLOQUEADO"),
    percentual: disponiveis ? Math.round((ocupados / disponiveis) * 100) : 0,
  };
}

const DAY = 24 * 3600 * 1000;

// Dias de internação: dias corridos desde a entrada, no horário de Brasília (0 no dia em que internou).
export function daysAdmitted(admittedAt: Date, until = new Date()) {
  const br = (d: Date) => {
    const local = new Date(d.getTime() - 3 * 3600 * 1000);
    return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  };
  return Math.max(0, Math.round((br(until) - br(admittedAt)) / DAY));
}

export function daysLabel(days: number) {
  if (days === 0) return "Internou hoje";
  return days === 1 ? "1 dia" : `${days} dias`;
}

// Cadastro de vários leitos de uma vez: "101 a 110", "201-A, 201-B" ou um por linha.
// Intervalos só com números (até 100 leitos por vez). Devolve os códigos sem repetição, na ordem.
export function parseBedCodes(input: string): { codes: string[]; error?: string } {
  const codes: string[] = [];
  for (const raw of input.split(/[,;\n]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\s*(?:a|até|ate)\s*(\d+)$/i);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (to < from) return { codes: [], error: `Intervalo invertido: ${part}.` };
      if (to - from >= 100) return { codes: [], error: "Cadastre no máximo 100 leitos por vez." };
      const width = range[1].length;
      for (let n = from; n <= to; n++) codes.push(String(n).padStart(width, "0"));
      continue;
    }
    if (part.length > 20) return { codes: [], error: `Código de leito muito longo: ${part}.` };
    codes.push(part.toUpperCase());
  }
  const unique = [...new Set(codes)];
  if (unique.length > 100) return { codes: [], error: "Cadastre no máximo 100 leitos por vez." };
  if (!unique.length) return { codes: [], error: "Informe os códigos dos leitos." };
  return { codes: unique };
}

// Ordena códigos de leito como as pessoas esperam: "2" antes de "10", "101-A" antes de "101-B".
export function compareBedCodes(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}
