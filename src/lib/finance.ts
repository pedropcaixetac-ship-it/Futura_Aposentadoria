import type { FinanceStatus, PaymentMethod } from "@prisma/client";

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  PIX: "Pix",
  DINHEIRO: "Dinheiro",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  TRANSFERENCIA: "Transferência",
  BOLETO: "Boleto",
  CONVENIO: "Convênio",
};

export const paymentMethods = Object.keys(paymentMethodLabel) as PaymentMethod[];

export const statusLabel: Record<FinanceStatus, string> = {
  PENDENTE: "Pendente",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
};

export const expenseCategories = [
  "Aluguel e condomínio",
  "Salários e encargos",
  "Repasse a profissionais",
  "Materiais e insumos",
  "Medicamentos",
  "Equipamentos",
  "Água, luz, internet e telefone",
  "Impostos e taxas",
  "Sistemas e serviços",
  "Marketing",
  "Manutenção",
  "Outros",
];

// Hoje no fuso de Brasília, como data sem horário (meia-noite UTC), igual às datas do financeiro no banco.
export function today() {
  const iso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(`${iso}T00:00:00Z`);
}

// Lê uma data digitada no formato do campo de data (aaaa-mm-dd).
export function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Mês no formato aaaa-mm (usado no endereço da página). Sem mês válido, usa o mês atual.
export function monthRange(month?: string) {
  const base = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : dateInput(today()).slice(0, 7);
  const [y, m] = base.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const shift = (delta: number) => dateInput(new Date(Date.UTC(y, m - 1 + delta, 1))).slice(0, 7);
  const label = start.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return { month: base, start, end, prev: shift(-1), next: shift(1), label: label[0].toUpperCase() + label.slice(1) };
}

// Valor do repasse: porcentagem do total recebido, arredondada para o centavo.
export function commission(receivedCents: number, percent: number | null | undefined) {
  return Math.round((receivedCents * (percent ?? 0)) / 100);
}

// Descrição da despesa de repasse; também serve para saber se o repasse do mês já foi lançado.
export function commissionDescription(professionalName: string, monthLabel: string) {
  return `Repasse ${professionalName} (${monthLabel})`;
}

// Tipos de compra da aba Compras e a categoria de despesa em que cada um entra.
export const purchaseKinds: Record<string, string> = {
  "Material médico/hospitalar": "Materiais e insumos",
  "Medicamentos": "Medicamentos",
  "Insumos": "Materiais e insumos",
  "Material de escritório e limpeza": "Materiais e insumos",
  "Equipamentos": "Equipamentos",
  "Outros": "Outros",
};

// Divide o valor da nota em parcelas iguais, a cada 30 dias a partir do primeiro vencimento.
// Os centavos que sobram da divisão vão para a primeira parcela.
export function splitInstallments(totalCents: number, count: number, firstDue: Date) {
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => ({
    dueDate: new Date(Date.UTC(firstDue.getUTCFullYear(), firstDue.getUTCMonth(), firstDue.getUTCDate() + 30 * i)),
    amountCents: base + (i === 0 ? totalCents - base * count : 0),
  }));
}

// Descrição de cada parcela na aba Despesas: "NF 1234 · Fornecedor (1/3)".
export function purchaseExpenseDescription(invoiceNumber: string, supplierName: string, installment: number, count: number) {
  const parcel = count > 1 ? ` (${installment}/${count})` : "";
  return `NF ${invoiceNumber} · ${supplierName}`.slice(0, 190) + parcel;
}
