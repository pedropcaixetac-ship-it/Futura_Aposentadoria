import type { EmploymentType } from "@prisma/client";
import { dateInput } from "./finance";

// Regras da aba Contabilidade (parte trabalhista e obrigações do mês).
// Datas sempre como meia-noite UTC, igual às datas do financeiro.

export const employmentTypeLabel: Record<EmploymentType, string> = {
  CLT: "CLT (carteira assinada)",
  PJ: "PJ (prestador com CNPJ)",
  ESTAGIO: "Estágio",
  AUTONOMO: "Autônomo (RPA)",
};

export const employmentTypes = Object.keys(employmentTypeLabel) as EmploymentType[];

export const obligationKinds = ["Imposto", "Trabalhista", "Envio"] as const;

const DAY = 86400000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY);
}

function addYears(date: Date, years: number) {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
}

function isWeekend(date: Date) {
  const d = date.getUTCDay();
  return d === 0 || d === 6;
}

// Dias contados do primeiro ao último, incluindo os dois.
export function daysBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / DAY) + 1;
}

// n-ésimo dia útil do mês (segunda a sexta; feriados não entram na conta).
export function nthBusinessDay(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  let date = new Date(Date.UTC(y, m - 1, 1));
  let count = 0;
  while (true) {
    if (!isWeekend(date)) count++;
    if (count === n) return date;
    date = addDays(date, 1);
  }
}

export type ObligationRule = { dueDay: number; businessDay: boolean; onlyMonth: number | null };

// Vencimento da obrigação no mês (aaaa-mm), ou null se ela não vence neste mês.
// Quando o dia cai em fim de semana, antecipamos para o dia útil anterior: pagar antes nunca gera multa.
export function obligationDueDate(rule: ObligationRule, month: string) {
  const [y, m] = month.split("-").map(Number);
  if (rule.onlyMonth && rule.onlyMonth !== m) return null;
  if (rule.businessDay) return nthBusinessDay(month, rule.dueDay);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let date = new Date(Date.UTC(y, m - 1, Math.min(rule.dueDay, lastDay)));
  while (isWeekend(date)) date = addDays(date, -1);
  return date;
}

// Vencimentos anteriores ao dia em que a obrigação foi cadastrada não contam como atrasados
// (a clínica começou a acompanhar depois).
export function trackedSince(due: Date, createdAt: Date) {
  return due >= new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate()));
}

// Obrigações que toda clínica com funcionários costuma ter. A clínica pode desligar ou acrescentar outras.
export const defaultObligations: (ObligationRule & { name: string; kind: (typeof obligationKinds)[number]; hint: string })[] = [
  { name: "Enviar documentos do mês ao contador", kind: "Envio", dueDay: 3, businessDay: true, onlyMonth: null, hint: "Extratos, notas de compra, folha do mês anterior (faltas e horas extras)." },
  { name: "Pagamento dos salários", kind: "Trabalhista", dueDay: 5, businessDay: true, onlyMonth: null, hint: "Até o 5º dia útil do mês seguinte ao trabalhado." },
  { name: "ISS (prefeitura)", kind: "Imposto", dueDay: 10, businessDay: false, onlyMonth: null, hint: "O dia muda de cidade para cidade: confira com o contador." },
  { name: "eSocial: envio da folha", kind: "Envio", dueDay: 15, businessDay: false, onlyMonth: null, hint: "Normalmente feito pelo contador." },
  { name: "FGTS (FGTS Digital)", kind: "Trabalhista", dueDay: 20, businessDay: false, onlyMonth: null, hint: "8% do salário de cada funcionário CLT." },
  { name: "INSS e IRRF (DARF da DCTFWeb)", kind: "Imposto", dueDay: 20, businessDay: false, onlyMonth: null, hint: "Guia gerada pelo contador." },
  { name: "Simples Nacional (DAS)", kind: "Imposto", dueDay: 20, businessDay: false, onlyMonth: null, hint: "Só para clínicas no Simples Nacional. Desligue se não for o caso." },
  { name: "13º salário: 1ª parcela", kind: "Trabalhista", dueDay: 30, businessDay: false, onlyMonth: 11, hint: "Metade do salário, até 30 de novembro." },
  { name: "13º salário: 2ª parcela", kind: "Trabalhista", dueDay: 20, businessDay: false, onlyMonth: 12, hint: "O restante, com os descontos, até 20 de dezembro." },
];

export const taxRegimes = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI", "Pessoa física (carnê-leão)"];

// Categoria da despesa no Financeiro quando a obrigação é paga.
export function obligationExpenseCategory(kind: string) {
  return kind === "Imposto" ? "Impostos e taxas" : "Salários e encargos";
}

// Funcionário que trabalhou pelo menos um dia no mês.
export function activeInMonth(employee: { admissionDate: Date; terminatedAt: Date | null }, range: { start: Date; end: Date }) {
  return employee.admissionDate < range.end && (!employee.terminatedAt || employee.terminatedAt >= range.start);
}

// FGTS do mês: 8% da remuneração (só para CLT).
export function fgts(cents: number, type: EmploymentType) {
  return type === "CLT" ? Math.round(cents * 0.08) : 0;
}

// Contrato de experiência: os primeiros 90 dias de quem é CLT.
export function trialEnd(admissionDate: Date) {
  return addDays(admissionDate, 89);
}

export type VacationPeriod = { start: Date; end: Date; deadline: Date; daysTaken: number; remaining: number };

// Férias (CLT): a cada 12 meses trabalhados (período aquisitivo) a pessoa ganha 30 dias,
// que precisam ser tirados nos 12 meses seguintes (período concessivo). Se passar do prazo, a clínica paga em dobro.
// Os dias tirados são descontados do período mais antigo primeiro.
export function vacationPeriods(admissionDate: Date, vacations: { startDate: Date; endDate: Date }[], ref: Date) {
  const periods: VacationPeriod[] = [];
  let start = admissionDate;
  while (addDays(addYears(start, 1), -1) < ref) {
    const end = addDays(addYears(start, 1), -1);
    periods.push({ start, end, deadline: addYears(end, 1), daysTaken: 0, remaining: 30 });
    start = addYears(start, 1);
  }
  let taken = vacations.reduce((t, v) => t + daysBetween(v.startDate, v.endDate), 0);
  for (const p of periods) {
    const use = Math.min(30, taken);
    p.daysTaken = use;
    p.remaining = 30 - use;
    taken -= use;
  }
  return { periods, current: { start, end: addDays(addYears(start, 1), -1) } };
}

export type LaborAlert = { tone: "red" | "gold"; text: string };

// Avisos de um funcionário: férias vencendo ou vencidas e fim do contrato de experiência.
export function laborAlerts(
  employee: { type: EmploymentType; admissionDate: Date; terminatedAt: Date | null },
  vacations: { startDate: Date; endDate: Date }[],
  ref: Date,
): LaborAlert[] {
  if (employee.terminatedAt || employee.type !== "CLT") return [];
  const alerts: LaborAlert[] = [];
  const trial = trialEnd(employee.admissionDate);
  if (ref <= trial) alerts.push({ tone: "gold", text: `Contrato de experiência termina em ${br(trial)}` });
  const pending = vacationPeriods(employee.admissionDate, vacations, ref).periods.find((p) => p.remaining > 0);
  if (pending) {
    if (pending.deadline < ref) {
      alerts.push({ tone: "red", text: `Férias vencidas desde ${br(pending.deadline)} (${pending.remaining} dias): devem ser pagas em dobro` });
    } else if (pending.deadline.getTime() - ref.getTime() <= 90 * DAY) {
      alerts.push({ tone: "red", text: `Férias precisam começar até ${br(addDays(pending.deadline, 1 - pending.remaining))} (${pending.remaining} dias)` });
    } else {
      alerts.push({ tone: "gold", text: `${pending.remaining} dias de férias a tirar até ${br(pending.deadline)}` });
    }
  }
  return alerts;
}

function br(date: Date) {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Planilha CSV que abre direto no Excel em português (separador ";" e acentos corretos).
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

export function csvMoney(cents: number | null | undefined) {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

export function csvDate(date: Date | null | undefined) {
  return date ? dateInput(date).split("-").reverse().join("/") : "";
}

export const terminationReasons = [
  "Pedido de demissão",
  "Dispensa sem justa causa",
  "Dispensa por justa causa",
  "Fim do contrato de experiência",
  "Acordo entre as partes",
  "Fim do contrato (estágio ou PJ)",
  "Outro",
];
