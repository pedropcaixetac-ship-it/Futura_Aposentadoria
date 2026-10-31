// Regras da cozinha hospitalar (refeições e mapa de dietas), sem acesso ao banco, para poderem ser testadas sozinhas.
import type { MealKind, MealStatus } from "@prisma/client";

// Horário de Brasília em que cada refeição é servida (hora, minuto).
export const MEALS: { kind: MealKind; label: string; hour: number; minute: number }[] = [
  { kind: "DESJEJUM", label: "Café da manhã", hour: 7, minute: 0 },
  { kind: "COLACAO", label: "Colação", hour: 9, minute: 30 },
  { kind: "ALMOCO", label: "Almoço", hour: 11, minute: 30 },
  { kind: "LANCHE", label: "Lanche da tarde", hour: 15, minute: 0 },
  { kind: "JANTAR", label: "Jantar", hour: 18, minute: 0 },
  { kind: "CEIA", label: "Ceia", hour: 21, minute: 0 },
];

export const mealLabel = Object.fromEntries(MEALS.map((m) => [m.kind, m.label])) as Record<MealKind, string>;

export const mealStatusLabel: Record<MealStatus, string> = { ENTREGUE: "Entregue", RECUSOU: "Recusou", NAO_SERVIDO: "Não servido" };

const BRT = 3 * 3600_000;

// Dia de hoje em Brasília (data pura, meia-noite UTC, como fica gravada no banco).
export function kitchenDate(now = new Date()) {
  const local = new Date(now.getTime() - BRT);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

// Refeição da vez: a última cujo horário já chegou (até 1h antes conta como a próxima). Antes do café, o café.
export function currentMeal(now = new Date()): MealKind {
  const local = new Date(now.getTime() - BRT);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes() + 60;
  let pick: MealKind = "DESJEJUM";
  for (const m of MEALS) if (m.hour * 60 + m.minute <= minutes) pick = m.kind;
  return pick;
}

const plain = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Jejum (dieta zero, NPO) não recebe bandeja.
export function isFasting(description: string) {
  const t = plain(description);
  return /\bjejum\b|\bdieta zero\b|\bnpo\b|\bnada por via oral\b/.test(t);
}

// Por sonda ou parenteral, a cozinha não manda bandeja comum.
export function isEnteral(description: string) {
  const t = plain(description);
  return /\bsonda\b|\benteral\b|\bsne\b|\bgastrostomia\b|\bparenteral\b|\bnpt\b/.test(t);
}

// Contagem para a produção: quantas de cada dieta (pelo texto prescrito) e quantos leitos sem dieta.
export function productionCount(patients: { diets: string[] }[]) {
  const counts = new Map<string, number>();
  let none = 0;
  let fasting = 0;
  for (const p of patients) {
    if (p.diets.length === 0) {
      none++;
      continue;
    }
    if (p.diets.some(isFasting)) {
      fasting++;
      continue;
    }
    const key = p.diets.join(" + ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { diets: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), none, fasting };
}
