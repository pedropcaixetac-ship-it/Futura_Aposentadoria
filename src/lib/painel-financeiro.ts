// Financeiro do Painel do dono: mensalidades recebidas das clínicas e cobrança pelo WhatsApp.
// Sem acesso ao banco, para poder ser testado sozinho.
import { formatMoney } from "./money";
import type { BillingStatus } from "./plans";

export const PAYMENT_METHODS = {
  pix: "Pix",
  boleto: "Boleto",
  cartao: "Cartão",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
} as const;

export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export function isPaymentMethod(value: string): value is PaymentMethod {
  return value in PAYMENT_METHODS;
}

const brDate = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

// Mês no formato "2026-10". Devolve o primeiro dia do mês e o primeiro do mês seguinte (datas @db.Date, meia-noite UTC).
export function monthRange(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const end = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
  return { start, end };
}

export function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

// Os últimos `count` meses terminando em `month`, do mais antigo para o mais novo.
export function lastMonths(month: string, count: number) {
  const range = monthRange(month);
  if (!range) return [];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(range.start);
    d.setUTCMonth(d.getUTCMonth() - (count - 1 - i));
    return monthKey(d);
  });
}

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function monthLabel(month: string, short = false) {
  const [y, m] = month.split("-").map(Number);
  const name = MONTH_NAMES[m - 1] ?? "";
  return short ? `${name.slice(0, 3)}/${String(y).slice(2)}` : `${name} de ${y}`;
}

type ChargeInput = {
  contactName: string | null;
  clinicName: string;
  planName: string | null;
  priceCents: number | null;
  paidUntil: Date;
  status: BillingStatus;
  pixKey?: string | null;
};

// Texto pronto para cobrar (ou lembrar) a mensalidade pelo WhatsApp. Quem aperta "enviar" é a pessoa.
export function chargeMessage(c: ChargeInput) {
  const hello = c.contactName ? `Olá, ${c.contactName.split(/\s+/)[0]}!` : "Olá!";
  const plan = c.planName ? ` (plano ${c.planName}${c.priceCents ? `, ${formatMoney(c.priceCents)}` : ""})` : "";
  const due = brDate(c.paidUntil);
  let body: string;
  if (c.status.kind === "atrasada" || c.status.kind === "bloqueada") {
    body = `A mensalidade do sistema da ${c.clinicName}${plan} venceu em ${due} e ainda não identificamos o pagamento.`;
    body += c.status.kind === "atrasada"
      ? ` Para não interromper o acesso da equipe, o pagamento precisa ser feito em até ${c.status.daysToBlock} dia${c.status.daysToBlock > 1 ? "s" : ""}.`
      : " O acesso da clínica está suspenso e volta assim que o pagamento for registrado.";
  } else {
    body = `Passando para lembrar que a mensalidade do sistema da ${c.clinicName}${plan} vence em ${due}.`;
  }
  const pix = c.pixKey ? `\n\nChave Pix: ${c.pixKey}` : "";
  return `${hello} ${body}${pix}\n\nSe já pagou, por favor desconsidere e, se puder, envie o comprovante por aqui. Obrigado!`;
}

type CsvPayment = {
  paidAt: Date;
  clinicName: string;
  amountCents: number;
  method: string;
  paidUntil: Date;
  registeredBy: string;
  notes: string | null;
  canceled: boolean;
};

// Planilha das mensalidades do mês (abre no Excel em português: ponto e vírgula e vírgula decimal).
export function paymentsCsv(rows: CsvPayment[]) {
  const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ["Data", "Clínica", "Valor (R$)", "Forma", "Pago até", "Registrado por", "Observação", "Situação"];
  const lines = rows.map((r) => [
    brDate(r.paidAt),
    r.clinicName,
    (r.amountCents / 100).toFixed(2).replace(".", ","),
    PAYMENT_METHODS[r.method as PaymentMethod] ?? r.method,
    brDate(r.paidUntil),
    r.registeredBy,
    r.notes ?? "",
    r.canceled ? "Desfeito" : "Recebido",
  ].map(cell).join(";"));
  // BOM para o Excel reconhecer os acentos.
  return "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n";
}
