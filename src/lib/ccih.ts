// Regras da CCIH (isolamentos, infecções e antimicrobianos), sem acesso ao banco, para poderem ser testadas sozinhas.
import type { InfectionSite, IsolationKind } from "@prisma/client";

export const isolationLabel: Record<IsolationKind, string> = { CONTATO: "Contato", GOTICULAS: "Gotículas", AEROSSOIS: "Aerossóis" };

// O que a equipe (e a copa) precisa usar ao entrar no quarto.
export const isolationHint: Record<IsolationKind, string> = {
  CONTATO: "Avental e luvas; material de uso exclusivo",
  GOTICULAS: "Máscara cirúrgica a menos de 1 metro",
  AEROSSOIS: "Máscara N95 e quarto com porta fechada",
};

export const isolationStyle: Record<IsolationKind, string> = {
  CONTATO: "bg-amber-100 text-amber-900",
  GOTICULAS: "bg-sky-100 text-sky-900",
  AEROSSOIS: "bg-red-100 text-red-900",
};

export const siteLabel: Record<InfectionSite, string> = {
  ICS: "Corrente sanguínea (ICS)",
  ITU: "Trato urinário (ITU)",
  PAV: "Pneumonia associada à ventilação (PAV)",
  ISC: "Sítio cirúrgico (ISC)",
  PELE: "Pele e partes moles",
  OUTRA: "Outra",
};

export const DEVICES = ["Cateter venoso central", "Sonda vesical de demora", "Ventilação mecânica", "Nenhum"];

// Antimicrobianos que a CCIH acompanha (nome genérico, sem acento).
export const ANTIMICROBIALS = [
  "amicacina", "amoxicilina", "ampicilina", "anidulafungina", "azitromicina", "aztreonam", "cefalexina", "cefalotina", "cefazolina",
  "cefepima", "cefotaxima", "cefoxitina", "ceftarolina", "ceftazidima", "ceftriaxona", "cefuroxima", "ciprofloxacino", "claritromicina",
  "clindamicina", "colistina", "daptomicina", "doxiciclina", "ertapenem", "fluconazol", "gentamicina", "imipenem", "levofloxacino",
  "linezolida", "meropenem", "metronidazol", "micafungina", "moxifloxacino", "oxacilina", "penicilina", "piperacilina", "polimixina",
  "sulfametoxazol", "teicoplanina", "tigeciclina", "vancomicina", "voriconazol", "anfotericina", "aciclovir", "ganciclovir", "oseltamivir",
];

const plain = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function isAntimicrobial(description: string) {
  const t = plain(description);
  return ANTIMICROBIALS.some((a) => t.includes(a));
}

const DAY = 24 * 3600_000;

// Dia de uso do antimicrobiano (D1 = dia em que começou).
export function therapyDay(startAt: Date, now = new Date()) {
  return Math.max(1, Math.floor((now.getTime() - startAt.getTime()) / DAY) + 1);
}

// Revisar: 7 dias ou mais sem data de término prevista.
export function needsReview(item: { startAt: Date; endAt: Date | null }, now = new Date()) {
  return !item.endAt && therapyDay(item.startAt, now) >= 7;
}

// Pacientes-dia de um período: soma dos dias que cada internação ocupou leito dentro dele.
export function patientDays(admissions: { admittedAt: Date; dischargedAt: Date | null }[], from: Date, to: Date) {
  let ms = 0;
  for (const a of admissions) {
    const start = Math.max(a.admittedAt.getTime(), from.getTime());
    const end = Math.min(a.dischargedAt?.getTime() ?? to.getTime(), to.getTime());
    if (end > start) ms += end - start;
  }
  return Math.round(ms / DAY);
}

// Densidade de infecção: infecções por 1.000 pacientes-dia (uma casa decimal).
export function infectionDensity(infections: number, days: number) {
  return days > 0 ? Math.round((infections / days) * 10_000) / 10 : 0;
}
