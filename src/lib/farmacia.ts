// Regras da farmácia hospitalar (estoque por lote e validade), sem acesso ao banco, para poderem ser testadas sozinhas.
import type { StockMovementKind } from "@prisma/client";

export const UNITS = ["unidade", "ampola", "frasco", "comprimido", "cápsula", "bolsa", "envelope", "seringa", "tubo", "caixa"];

export const movementLabel: Record<StockMovementKind, string> = {
  ENTRADA: "Entrada",
  DISPENSACAO: "Dispensação",
  DEVOLUCAO: "Devolução",
  AJUSTE: "Ajuste de inventário",
  PERDA: "Perda / vencimento",
};

const DAY = 24 * 3600_000;

export type Lot = { lot: string; expiresAt: Date | null; balance: number };

// Saldo de cada lote a partir das movimentações. Lotes zerados somem; a ordem é a de saída:
// vence primeiro, sai primeiro (lote sem validade por último).
export function lotBalances(movements: { lot: string; expiresAt: Date | null; quantity: number }[]): Lot[] {
  const map = new Map<string, Lot>();
  for (const m of movements) {
    const cur = map.get(m.lot) ?? { lot: m.lot, expiresAt: null, balance: 0 };
    cur.balance += m.quantity;
    if (m.expiresAt) cur.expiresAt = m.expiresAt;
    map.set(m.lot, cur);
  }
  return [...map.values()]
    .filter((l) => l.balance > 0)
    .sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity) || a.lot.localeCompare(b.lot));
}

// Vencido não sai para o paciente.
export function isExpired(expiresAt: Date | null, now = new Date()) {
  return !!expiresAt && expiresAt.getTime() < now.getTime();
}

export type ExpiryState = "VENCIDO" | "VENCE_EM_BREVE" | "OK";
export function expiryState(expiresAt: Date | null, now = new Date()): ExpiryState {
  if (!expiresAt) return "OK";
  if (isExpired(expiresAt, now)) return "VENCIDO";
  return expiresAt.getTime() - now.getTime() <= 30 * DAY ? "VENCE_EM_BREVE" : "OK";
}

// Quais lotes atendem a quantidade pedida, pela ordem de saída e sem usar lote vencido.
export function pickLots(lots: Lot[], quantity: number, now = new Date()): { lots: { lot: string; expiresAt: Date | null; take: number }[]; missing: number } {
  let rest = quantity;
  const picked: { lot: string; expiresAt: Date | null; take: number }[] = [];
  for (const l of lots) {
    if (rest <= 0) break;
    if (isExpired(l.expiresAt, now)) continue;
    const take = Math.min(l.balance, rest);
    picked.push({ lot: l.lot, expiresAt: l.expiresAt, take });
    rest -= take;
  }
  return { lots: picked, missing: rest };
}

// Saldo que pode ser usado (sem os lotes vencidos).
export function usableBalance(lots: Lot[], now = new Date()) {
  return lots.filter((l) => !isExpired(l.expiresAt, now)).reduce((s, l) => s + l.balance, 0);
}
