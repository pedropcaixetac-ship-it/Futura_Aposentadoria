import { parseMoney } from "./money";
import { parseDateInput, purchaseKinds } from "./finance";

// O que chega do formulário de nota fiscal de compra (os itens e as parcelas vêm como listas).
export type PurchaseInput = {
  kind: string;
  supplierName: string;
  supplierCnpj: string;
  invoiceNumber: string;
  invoiceSeries: string;
  accessKey: string;
  issueDate: string;
  total: string;
  notes: string;
  items: { description: string; unit: string; quantity: string; unitPrice: string; total?: string; batch: string; expiresAt: string }[];
  installments: { dueDate: string; amount: string }[];
};

export type PurchaseData = {
  kind: string;
  supplierName: string;
  supplierCnpj: string | null;
  invoiceNumber: string;
  invoiceSeries: string | null;
  accessKey: string | null;
  issueDate: Date;
  totalCents: number;
  notes: string | null;
  items: {
    position: number;
    description: string;
    unit: string | null;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    batch: string | null;
    expiresAt: Date | null;
  }[];
  installments: { installment: number; dueDate: Date; amountCents: number }[];
};

const clean = (value: unknown) => String(value ?? "").trim();

// Quantidade com vírgula ou ponto e até 4 casas: "10", "2,5", "0.250".
export function parseQuantity(input: string) {
  const value = input.trim();
  if (!/^\d+([.,]\d{1,4})?$/.test(value)) return null;
  const n = Number(value.replace(",", "."));
  return n > 0 ? Math.round(n * 1000) / 1000 : null;
}

export function itemTotal(quantity: number, unitPriceCents: number) {
  return Math.round(quantity * unitPriceCents);
}

// Confere tudo o que foi digitado. Devolve a mensagem de erro (em português simples) ou os dados prontos.
export function validatePurchase(input: PurchaseInput): { error: string } | { data: PurchaseData } {
  if (!(clean(input.kind) in purchaseKinds)) return { error: "Escolha o tipo da compra." };
  const supplierName = clean(input.supplierName);
  if (!supplierName) return { error: "Informe o fornecedor." };
  const supplierCnpj = clean(input.supplierCnpj).replace(/\D/g, "") || null;
  if (supplierCnpj && supplierCnpj.length !== 14 && supplierCnpj.length !== 11) {
    return { error: "O CNPJ do fornecedor deve ter 14 números (ou 11, se for CPF)." };
  }
  const invoiceNumber = clean(input.invoiceNumber).replace(/^0+(?=\d)/, "");
  if (!invoiceNumber) return { error: "Informe o número da nota fiscal." };
  const accessKey = clean(input.accessKey).replace(/\D/g, "") || null;
  if (accessKey && accessKey.length !== 44) return { error: "A chave de acesso da nota tem 44 números." };
  const issueDate = parseDateInput(clean(input.issueDate));
  if (!issueDate) return { error: "Informe a data de emissão da nota." };
  const totalCents = parseMoney(clean(input.total));
  if (!totalCents) return { error: "Informe o valor total da nota (ex.: 1.250,00)." };

  const items: PurchaseData["items"] = [];
  for (const [i, raw] of (input.items ?? []).entries()) {
    const description = clean(raw.description);
    // Linha totalmente vazia é ignorada.
    if (!description && !clean(raw.quantity) && !clean(raw.unitPrice)) continue;
    const line = `Item ${i + 1}`;
    if (!description) return { error: `${line}: descreva o produto.` };
    const quantity = parseQuantity(clean(raw.quantity));
    if (!quantity) return { error: `${line} (${description}): informe a quantidade.` };
    const unitPriceCents = parseMoney(clean(raw.unitPrice));
    if (unitPriceCents === null) return { error: `${line} (${description}): informe o valor unitário.` };
    const expiresRaw = clean(raw.expiresAt);
    const expiresAt = expiresRaw ? parseDateInput(expiresRaw) : null;
    if (expiresRaw && !expiresAt) return { error: `${line} (${description}): validade inválida.` };
    items.push({
      position: items.length + 1,
      description: description.slice(0, 200),
      unit: clean(raw.unit).slice(0, 10) || null,
      quantity,
      unitPriceCents,
      totalCents: (raw.total && parseMoney(clean(raw.total))) || itemTotal(quantity, unitPriceCents),
      batch: clean(raw.batch).slice(0, 40) || null,
      expiresAt,
    });
  }

  const rawInstallments = input.installments ?? [];
  if (rawInstallments.length < 1 || rawInstallments.length > 36) return { error: "Informe de 1 a 36 parcelas." };
  const installments: PurchaseData["installments"] = [];
  for (const [i, raw] of rawInstallments.entries()) {
    const dueDate = parseDateInput(clean(raw.dueDate));
    if (!dueDate) return { error: `Parcela ${i + 1}: informe o vencimento.` };
    const amountCents = parseMoney(clean(raw.amount));
    if (!amountCents) return { error: `Parcela ${i + 1}: informe o valor.` };
    installments.push({ installment: i + 1, dueDate, amountCents });
  }
  const parcelSum = installments.reduce((t, p) => t + p.amountCents, 0);
  if (parcelSum !== totalCents) {
    return { error: "A soma das parcelas não bate com o valor total da nota. Confira os valores." };
  }

  return {
    data: {
      kind: clean(input.kind),
      supplierName: supplierName.slice(0, 150),
      supplierCnpj,
      invoiceNumber: invoiceNumber.slice(0, 20),
      invoiceSeries: clean(input.invoiceSeries).slice(0, 5) || null,
      accessKey,
      issueDate,
      totalCents,
      notes: clean(input.notes) || null,
      items,
      installments,
    },
  };
}

export function formatCnpj(value: string | null) {
  if (!value) return "";
  if (value.length === 14) return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (value.length === 11) return value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return value;
}
