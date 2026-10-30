"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canCancelCharge, canManageCharges, canManageFinance } from "@/lib/permissions";
import { parseMoney } from "@/lib/money";
import { commission, commissionDescription, expenseCategories, monthRange, parseDateInput, paymentMethods, purchaseExpenseDescription, purchaseKinds, today } from "@/lib/finance";
import { validatePurchase, type PurchaseInput } from "@/lib/purchase";

export type FormState = { error: string; ok?: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function method(formData: FormData) {
  const value = text(formData, "paymentMethod");
  return paymentMethods.includes(value as PaymentMethod) ? (value as PaymentMethod) : null;
}

async function requireCharges() {
  const user = await requireUser("financeiro");
  if (!canManageCharges(user)) throw new Error("Sem permissão");
  return user;
}

async function requireAdmin() {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) throw new Error("Sem permissão");
  return user;
}

function revalidateFinance() {
  revalidatePath("/financeiro", "layout");
}

// Marca a cobrança como paga e dá a ela o próximo número de recibo da clínica.
// Tudo numa única operação, para dois recebimentos ao mesmo tempo não pegarem o mesmo número.
async function markPaid(clinicId: string, chargeId: string, paymentMethod: PaymentMethod, paidAt: Date) {
  return prisma.$transaction(async (tx) => {
    const { lastReceiptNumber } = await tx.clinic.update({
      where: { id: clinicId },
      data: { lastReceiptNumber: { increment: 1 } },
    });
    const { count } = await tx.charge.updateMany({
      where: { id: chargeId, clinicId, status: "PENDENTE" },
      data: { status: "PAGO", paymentMethod, paidAt, receiptNumber: lastReceiptNumber },
    });
    if (count === 0) throw new Error("Esta cobrança já foi paga ou cancelada");
    return lastReceiptNumber;
  });
}

// ---------- Receitas (cobranças) ----------

export async function createCharge(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireCharges();

  const patientId = text(formData, "patientId");
  const patient = patientId ? await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } }) : null;
  if (!patient) return { error: "Escolha o paciente." };

  const encounterId = text(formData, "encounterId");
  const encounter = encounterId
    ? await prisma.encounter.findFirst({ where: { id: encounterId, clinicId: user.clinicId, patientId: patient.id } })
    : null;

  const professionalId = encounter?.professionalId ?? text(formData, "professionalId");
  const professional = professionalId
    ? await prisma.user.findFirst({ where: { id: professionalId, clinicId: user.clinicId } })
    : null;

  const priceItemId = text(formData, "priceItemId");
  const priceItem = priceItemId ? await prisma.priceItem.findFirst({ where: { id: priceItemId, clinicId: user.clinicId } }) : null;

  const description = text(formData, "description") ?? priceItem?.name;
  if (!description) return { error: "Descreva o que está sendo cobrado." };
  const amountCents = parseMoney(text(formData, "amount") ?? "");
  if (!amountCents) return { error: "Informe um valor válido (ex.: 150,00)." };
  const dueDate = parseDateInput(text(formData, "dueDate") ?? "") ?? today();

  const paidNow = formData.get("paidNow") === "on";
  const paymentMethod = method(formData);
  const paidAt = parseDateInput(text(formData, "paidAt") ?? "") ?? today();
  if (paidNow && !paymentMethod) return { error: "Informe a forma de pagamento." };

  const charge = await prisma.charge.create({
    data: {
      clinicId: user.clinicId,
      patientId: patient.id,
      professionalId: professional?.id,
      encounterId: encounter?.id,
      priceItemId: priceItem?.id,
      description: description.slice(0, 200),
      amountCents,
      dueDate,
      notes: text(formData, "notes"),
    },
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "COBRANCA_CRIADA",
    entity: "Charge",
    entityId: charge.id,
    patientId: patient.id,
    details: { amountCents },
  });
  if (paidNow && paymentMethod) {
    const receiptNumber = await markPaid(user.clinicId, charge.id, paymentMethod, paidAt);
    await audit({
      clinicId: user.clinicId,
      userId: user.id,
      action: "PAGAMENTO_RECEBIDO",
      entity: "Charge",
      entityId: charge.id,
      patientId: patient.id,
      details: { paymentMethod, receiptNumber },
    });
  }
  revalidateFinance();
  redirect(`/financeiro/receitas?mes=${monthRange(text(formData, "dueDate")?.slice(0, 7)).month}`);
}

export async function receiveCharge(chargeId: string, formData: FormData) {
  const user = await requireCharges();
  const charge = await prisma.charge.findFirst({ where: { id: chargeId, clinicId: user.clinicId } });
  if (!charge) throw new Error("Cobrança não encontrada");
  const paymentMethod = method(formData);
  if (!paymentMethod) throw new Error("Informe a forma de pagamento");
  const paidAt = parseDateInput(text(formData, "paidAt") ?? "") ?? today();

  const receiptNumber = await markPaid(user.clinicId, charge.id, paymentMethod, paidAt);
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "PAGAMENTO_RECEBIDO",
    entity: "Charge",
    entityId: charge.id,
    patientId: charge.patientId,
    details: { paymentMethod, receiptNumber },
  });
  revalidateFinance();
}

export async function cancelCharge(chargeId: string) {
  const user = await requireUser("financeiro");
  const charge = await prisma.charge.findFirst({ where: { id: chargeId, clinicId: user.clinicId } });
  if (!charge || !canCancelCharge(user, charge)) throw new Error("Sem permissão");
  await prisma.charge.update({ where: { id: charge.id }, data: { status: "CANCELADO" } });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "COBRANCA_CANCELADA",
    entity: "Charge",
    entityId: charge.id,
    patientId: charge.patientId,
    details: { previousStatus: charge.status },
  });
  revalidateFinance();
}

// ---------- Despesas ----------

export async function createExpense(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const description = text(formData, "description");
  if (!description) return { error: "Descreva a despesa." };
  const category = text(formData, "category");
  if (!category || !expenseCategories.includes(category)) return { error: "Escolha a categoria." };
  const amountCents = parseMoney(text(formData, "amount") ?? "");
  if (!amountCents) return { error: "Informe um valor válido (ex.: 1.200,00)." };
  const dueDate = parseDateInput(text(formData, "dueDate") ?? "");
  if (!dueDate) return { error: "Informe o vencimento." };

  const paidNow = formData.get("paidNow") === "on";
  const paymentMethod = method(formData);
  if (paidNow && !paymentMethod) return { error: "Informe a forma de pagamento." };

  const expense = await prisma.expense.create({
    data: {
      clinicId: user.clinicId,
      description: description.slice(0, 200),
      category,
      amountCents,
      dueDate,
      notes: text(formData, "notes"),
      ...(paidNow && { status: "PAGO", paymentMethod, paidAt: parseDateInput(text(formData, "paidAt") ?? "") ?? today() }),
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "DESPESA_CRIADA", entity: "Expense", entityId: expense.id, details: { amountCents } });
  revalidateFinance();
  return { error: "", ok: "Despesa lançada." };
}

export async function payExpense(expenseId: string, formData: FormData) {
  const user = await requireAdmin();
  const paymentMethod = method(formData);
  if (!paymentMethod) throw new Error("Informe a forma de pagamento");
  const paidAt = parseDateInput(text(formData, "paidAt") ?? "") ?? today();
  const { count } = await prisma.expense.updateMany({
    where: { id: expenseId, clinicId: user.clinicId, status: "PENDENTE" },
    data: { status: "PAGO", paymentMethod, paidAt },
  });
  if (count === 0) throw new Error("Despesa não encontrada");
  await audit({ clinicId: user.clinicId, userId: user.id, action: "DESPESA_PAGA", entity: "Expense", entityId: expenseId });
  revalidateFinance();
}

export async function cancelExpense(expenseId: string) {
  const user = await requireAdmin();
  const { count } = await prisma.expense.updateMany({
    where: { id: expenseId, clinicId: user.clinicId, status: { not: "CANCELADO" } },
    data: { status: "CANCELADO" },
  });
  if (count === 0) throw new Error("Despesa não encontrada");
  await audit({ clinicId: user.clinicId, userId: user.id, action: "DESPESA_CANCELADA", entity: "Expense", entityId: expenseId });
  revalidateFinance();
}

// ---------- Compras (notas fiscais de entrada) ----------

export async function createPurchase(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  let lists: Pick<PurchaseInput, "items" | "installments">;
  try {
    lists = { items: JSON.parse(String(formData.get("items") ?? "[]")), installments: JSON.parse(String(formData.get("installments") ?? "[]")) };
  } catch {
    return { error: "Não foi possível ler os itens da nota. Recarregue a página e tente de novo." };
  }
  const result = validatePurchase({
    kind: text(formData, "kind") ?? "",
    supplierName: text(formData, "supplierName") ?? "",
    supplierCnpj: text(formData, "supplierCnpj") ?? "",
    invoiceNumber: text(formData, "invoiceNumber") ?? "",
    invoiceSeries: text(formData, "invoiceSeries") ?? "",
    accessKey: text(formData, "accessKey") ?? "",
    issueDate: text(formData, "issueDate") ?? "",
    total: text(formData, "total") ?? "",
    notes: text(formData, "notes") ?? "",
    ...lists,
  });
  if ("error" in result) return result;
  const data = result.data;

  const paidNow = formData.get("paidNow") === "on";
  const paymentMethod = method(formData);
  if (paidNow && !paymentMethod) return { error: "Informe a forma de pagamento." };
  const paidAt = parseDateInput(text(formData, "paidAt") ?? "") ?? today();

  // A mesma nota (mesmo número e mesmo fornecedor, ou mesma chave de acesso) não pode entrar duas vezes.
  const duplicate = await prisma.purchase.findFirst({
    where: {
      clinicId: user.clinicId,
      status: "ATIVA",
      OR: [
        { invoiceNumber: data.invoiceNumber, ...(data.supplierCnpj ? { supplierCnpj: data.supplierCnpj } : { supplierName: { equals: data.supplierName, mode: "insensitive" } }) },
        ...(data.accessKey ? [{ accessKey: data.accessKey }] : []),
      ],
    },
  });
  if (duplicate) return { error: `Esta nota já foi lançada (NF ${duplicate.invoiceNumber} de ${duplicate.supplierName}).` };

  const count = data.installments.length;
  const purchase = await prisma.purchase.create({
    data: {
      clinicId: user.clinicId,
      createdById: user.id,
      kind: data.kind,
      supplierName: data.supplierName,
      supplierCnpj: data.supplierCnpj,
      invoiceNumber: data.invoiceNumber,
      invoiceSeries: data.invoiceSeries,
      accessKey: data.accessKey,
      issueDate: data.issueDate,
      totalCents: data.totalCents,
      notes: data.notes,
      items: { create: data.items },
      expenses: {
        create: data.installments.map((p) => ({
          clinicId: user.clinicId,
          description: purchaseExpenseDescription(data.invoiceNumber, data.supplierName, p.installment, count),
          category: purchaseKinds[data.kind],
          amountCents: p.amountCents,
          dueDate: p.dueDate,
          installment: p.installment,
          ...(paidNow && { status: "PAGO" as const, paymentMethod, paidAt }),
        })),
      },
    },
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "COMPRA_LANCADA",
    entity: "Purchase",
    entityId: purchase.id,
    details: { invoiceNumber: data.invoiceNumber, totalCents: data.totalCents, installments: count },
  });
  revalidateFinance();
  redirect(`/financeiro/compras/${purchase.id}`);
}

// Cancela a nota lançada por engano e as parcelas dela na aba Despesas.
export async function cancelPurchase(purchaseId: string) {
  const user = await requireAdmin();
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.purchase.updateMany({
      where: { id: purchaseId, clinicId: user.clinicId, status: "ATIVA" },
      data: { status: "CANCELADA" },
    });
    if (count === 0) throw new Error("Nota não encontrada");
    await tx.expense.updateMany({
      where: { purchaseId, clinicId: user.clinicId, status: { not: "CANCELADO" } },
      data: { status: "CANCELADO" },
    });
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "COMPRA_CANCELADA", entity: "Purchase", entityId: purchaseId });
  revalidateFinance();
}

// ---------- Tabela de preços e dados da clínica ----------

export async function createPriceItem(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const name = text(formData, "name");
  if (!name) return { error: "Informe o nome da consulta ou procedimento." };
  const priceCents = parseMoney(text(formData, "price") ?? "");
  if (!priceCents) return { error: "Informe um valor válido (ex.: 250,00)." };
  const item = await prisma.priceItem.create({ data: { clinicId: user.clinicId, name: name.slice(0, 120), priceCents } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRECO_CRIADO", entity: "PriceItem", entityId: item.id, details: { priceCents } });
  revalidateFinance();
  return { error: "", ok: "Preço cadastrado." };
}

export async function updatePriceItem(itemId: string, formData: FormData) {
  const user = await requireAdmin();
  const priceCents = parseMoney(text(formData, "price") ?? "");
  if (!priceCents) throw new Error("Valor inválido");
  const active = formData.get("active") === "on";
  const { count } = await prisma.priceItem.updateMany({ where: { id: itemId, clinicId: user.clinicId }, data: { priceCents, active } });
  if (count === 0) throw new Error("Preço não encontrado");
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRECO_ALTERADO", entity: "PriceItem", entityId: itemId, details: { priceCents, active } });
  revalidateFinance();
}

export async function updateClinicInfo(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const cnpj = text(formData, "cnpj")?.replace(/\D/g, "") || null;
  if (cnpj && cnpj.length !== 14) return { error: "O CNPJ deve ter 14 números." };
  await prisma.clinic.update({
    where: { id: user.clinicId },
    data: { cnpj, address: text(formData, "address"), phone: text(formData, "phone") },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CLINICA_ALTERADA", entity: "Clinic", entityId: user.clinicId });
  revalidateFinance();
  return { error: "", ok: "Dados salvos." };
}

// ---------- Repasse ----------

export async function updateCommission(professionalId: string, formData: FormData) {
  const user = await requireAdmin();
  const raw = text(formData, "percent");
  const percent = raw === null ? null : Number(raw);
  if (percent !== null && (!Number.isInteger(percent) || percent < 0 || percent > 100)) {
    throw new Error("A porcentagem deve ser um número inteiro de 0 a 100");
  }
  const { count } = await prisma.user.updateMany({
    where: { id: professionalId, clinicId: user.clinicId },
    data: { commissionPercent: percent },
  });
  if (count === 0) throw new Error("Profissional não encontrado");
  await audit({ clinicId: user.clinicId, userId: user.id, action: "REPASSE_ALTERADO", entity: "User", entityId: professionalId, details: { percent } });
  revalidateFinance();
}

// Lança o repasse do mês como despesa da clínica, para ele entrar no saldo.
export async function launchCommissionExpense(professionalId: string, month: string) {
  const user = await requireAdmin();
  const range = monthRange(month);
  const professional = await prisma.user.findFirst({ where: { id: professionalId, clinicId: user.clinicId } });
  if (!professional) throw new Error("Profissional não encontrado");
  const received = await prisma.charge.aggregate({
    where: { clinicId: user.clinicId, professionalId, status: "PAGO", paidAt: { gte: range.start, lt: range.end } },
    _sum: { amountCents: true },
  });
  const amountCents = commission(received._sum.amountCents ?? 0, professional.commissionPercent);
  if (!amountCents) throw new Error("Não há repasse a lançar neste mês");

  const description = commissionDescription(professional.name, range.label);
  const existing = await prisma.expense.findFirst({
    where: { clinicId: user.clinicId, description, status: { not: "CANCELADO" } },
  });
  if (existing) throw new Error("O repasse deste mês já foi lançado");

  const expense = await prisma.expense.create({
    data: {
      clinicId: user.clinicId,
      description,
      category: "Repasse a profissionais",
      amountCents,
      // Vence no 5º dia do mês seguinte.
      dueDate: new Date(range.end.getTime() + 4 * 86400000),
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "DESPESA_CRIADA", entity: "Expense", entityId: expense.id, details: { amountCents } });
  revalidateFinance();
  redirect(`/financeiro/despesas?mes=${range.next}`);
}
