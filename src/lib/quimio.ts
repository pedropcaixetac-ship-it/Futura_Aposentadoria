// Regras da quimioterapia (superfície corporal, doses e calendário), sem acesso ao banco, para poderem ser testadas sozinhas.
import type { ChemoSessionStatus } from "@prisma/client";

export const DOSE_UNITS = ["mg/m²", "mg/kg", "mg", "UI/m²"] as const;
export type DoseUnit = (typeof DOSE_UNITS)[number];

export type ProtocolDrug = { drug: string; dose: number; unit: DoseUnit; route: string; days: number[] };
export type SessionDose = { drug: string; prescribed: string; dose: number; doseUnit: string; route: string };

export const sessionStatusLabel: Record<ChemoSessionStatus, string> = { AGENDADA: "Agendada", REALIZADA: "Aplicada", ADIADA: "Adiada", CANCELADA: "Cancelada" };

// Superfície corporal pela fórmula de Mosteller, em m² com duas casas.
export function bodySurface(heightCm: number, weightKg: number) {
  return Math.round(Math.sqrt((heightCm * weightKg) / 3600) * 100) / 100;
}

// Lê os dias do protocolo escritos como "1, 8" ou "1-3".
export function parseDays(text: string): number[] | null {
  const days = new Set<number>();
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)-(\d+)$/);
    const nums = range ? Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, i) => Number(range[1]) + i) : [Number(part)];
    if (nums.length === 0 || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 365)) return null;
    nums.forEach((n) => days.add(n));
  }
  return days.size ? [...days].sort((a, b) => a - b) : null;
}

const round = (n: number) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);

// Dose de um medicamento para este paciente, já com o percentual de dose do tratamento.
export function computeDose(d: ProtocolDrug, plan: { bsa: number; weightKg: number; doseLevel: number }): SessionDose {
  const factor = plan.doseLevel / 100;
  const base = d.unit === "mg/m²" || d.unit === "UI/m²" ? d.dose * plan.bsa : d.unit === "mg/kg" ? d.dose * plan.weightKg : d.dose;
  return { drug: d.drug, prescribed: `${d.dose} ${d.unit}`, dose: round(base * factor), doseUnit: d.unit === "UI/m²" ? "UI" : "mg", route: d.route };
}

const DAY = 24 * 3600_000;

// Calendário do tratamento: uma sessão por dia de aplicação de cada ciclo, com as doses daquele dia.
export function buildSessions(drugs: ProtocolDrug[], cycleDays: number, cycles: number, startDate: Date, plan: { bsa: number; weightKg: number; doseLevel: number }) {
  const days = [...new Set(drugs.flatMap((d) => d.days))].sort((a, b) => a - b);
  const sessions: { cycle: number; day: number; date: Date; doses: SessionDose[] }[] = [];
  for (let c = 1; c <= cycles; c++) {
    for (const day of days) {
      const date = new Date(startDate.getTime() + ((c - 1) * cycleDays + day - 1) * DAY);
      sessions.push({ cycle: c, day, date, doses: drugs.filter((d) => d.days.includes(day)).map((d) => computeDose(d, plan)) });
    }
  }
  return sessions;
}

// Lê o JSON do protocolo gravado no banco.
export function protocolDrugs(json: unknown): ProtocolDrug[] {
  return Array.isArray(json) ? (json as ProtocolDrug[]) : [];
}

export function sessionDoses(json: unknown): SessionDose[] {
  return Array.isArray(json) ? (json as SessionDose[]) : [];
}
