"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { withLock } from "@/lib/lock";
import { parseMoney } from "@/lib/money";
import { today } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { payerKind } from "@/lib/conta-hospitalar";
import { refreshBill } from "./data";

export type FormState = { error: string; ok?: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

// Tabela de preços: um campo por item cobrável (p_<chave>). Vazio tira o preço.
export async function savePrices(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("contas");
  const changes: { key: string; cents: number | null }[] = [];
  for (const [field, value] of formData.entries()) {
    if (!field.startsWith("p_")) continue;
    const key = field.slice(2);
    if (!/^(diaria|exame|med|sala):.{1,100}$/.test(key)) continue;
    const raw = String(value).trim();
    if (!raw) {
      changes.push({ key, cents: null });
      continue;
    }
    const cents = parseMoney(raw);
    if (cents === null) return { error: `Valor inválido: "${raw}". Use, por exemplo, 150,00.` };
    changes.push({ key, cents });
  }
  await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      if (c.cents === null) await tx.hospitalPrice.deleteMany({ where: { clinicId: user.clinicId, key: c.key } });
      else
        await tx.hospitalPrice.upsert({
          where: { clinicId_key: { clinicId: user.clinicId, key: c.key } },
          create: { clinicId: user.clinicId, key: c.key, priceCents: c.cents },
          update: { priceCents: c.cents },
        });
    }
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONTA_PRECOS", entity: "HospitalPrice", details: { itens: changes.length } });
  revalidatePath("/contas", "layout");
  return { error: "", ok: "Tabela de preços salva. As contas abertas já usam os preços novos." };
}

// Lançamento à mão: taxa ou outro item que nenhum setor registra (ex.: acompanhante, kit de higiene).
export async function addBillItem(admissionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("contas");
  const kind = text(formData, "kind");
  if (kind !== "TAXA" && kind !== "OUTRO") return { error: "Escolha o tipo." };
  const description = text(formData, "description");
  if (!description) return { error: "Descreva o lançamento." };
  const quantity = Number(text(formData, "quantity") ?? "1");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) return { error: "Quantidade inválida." };
  const unitCents = parseMoney(text(formData, "unit") ?? "");
  if (unitCents === null) return { error: "Informe o valor (ex.: 50,00)." };
  const error = await withLock([`conta:${admissionId}`], async (tx) => {
    const bill = await refreshBill(user.clinicId, admissionId, tx);
    if (!bill) return "Internação não encontrada.";
    if (bill.status !== "ABERTA") return "Esta conta já foi fechada.";
    await tx.hospitalBillItem.create({
      data: { clinicId: user.clinicId, billId: bill.id, kind, description: description.slice(0, 200), quantity, unitCents, totalCents: quantity * unitCents, addedById: user.id },
    });
    await tx.hospitalBill.update({ where: { id: bill.id }, data: { totalCents: bill.totalCents + quantity * unitCents } });
    return null;
  });
  if (error) return { error };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONTA_LANCAMENTO", entity: "Admission", entityId: admissionId, details: { item: description, quantidade: quantity, valor: unitCents } });
  revalidatePath(`/contas/${admissionId}`);
  return { error: "", ok: "Lançado." };
}

// Só o que foi lançado à mão sai; o automático some sozinho quando o setor desfaz (ex.: exame cancelado).
export async function removeBillItem(admissionId: string, itemId: string) {
  const user = await requireUser("contas");
  const item = await prisma.hospitalBillItem.findFirst({ where: { id: itemId, clinicId: user.clinicId, source: null, bill: { admissionId, status: "ABERTA" } } });
  if (!item) return;
  await withLock([`conta:${admissionId}`], async (tx) => {
    await tx.hospitalBillItem.delete({ where: { id: item.id } });
    await refreshBill(user.clinicId, admissionId, tx);
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONTA_LANCAMENTO_REMOVIDO", entity: "Admission", entityId: admissionId, details: { item: item.description } });
  revalidatePath(`/contas/${admissionId}`);
}

// Fecha a conta depois da alta. Particular vira cobrança no Financeiro; SUS e convênio seguem para o faturamento.
export async function closeBill(admissionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("contas");
  const result = await withLock([`conta:${admissionId}`], async (tx) => {
    const admission = await tx.admission.findFirst({ where: { id: admissionId, clinicId: user.clinicId }, include: { patient: { select: { id: true, name: true } } } });
    if (!admission) return "Internação não encontrada.";
    if (!admission.dischargedAt) return "A conta só fecha depois da alta.";
    const bill = await refreshBill(user.clinicId, admissionId, tx);
    if (!bill) return "Internação não encontrada.";
    if (bill.status !== "ABERTA") return "Esta conta já foi fechada.";
    const noPrice = await tx.hospitalBillItem.findMany({ where: { clinicId: user.clinicId, billId: bill.id, unitCents: 0 }, select: { description: true } });
    if (noPrice.length && formData.get("semPreco") !== "on") {
      return `Há ${noPrice.length} item(ns) sem preço (${noPrice.slice(0, 3).map((i) => i.description).join(", ")}${noPrice.length > 3 ? "..." : ""}). Cadastre na tabela de preços ou marque que pode fechar assim.`;
    }
    const particular = payerKind(bill.payer) === "PARTICULAR";
    const charge =
      particular && bill.totalCents > 0
        ? await tx.charge.create({
            data: {
              clinicId: user.clinicId,
              patientId: admission.patient.id,
              description: `Conta hospitalar: internação de ${formatDate(admission.admittedAt)} a ${formatDate(admission.dischargedAt)}`,
              amountCents: bill.totalCents,
              dueDate: today(),
            },
          })
        : null;
    await tx.hospitalBill.update({ where: { id: bill.id }, data: { status: "FECHADA", closedAt: new Date(), closedById: user.id, chargeId: charge?.id ?? null } });
    return { total: bill.totalCents, charge: !!charge };
  });
  if (typeof result === "string") return { error: result };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONTA_FECHADA", entity: "Admission", entityId: admissionId, details: { total: result.total } });
  revalidatePath("/contas");
  revalidatePath(`/contas/${admissionId}`);
  return { error: "", ok: result.charge ? "Conta fechada. A cobrança do paciente já está em Financeiro > Receitas." : "Conta fechada." };
}
