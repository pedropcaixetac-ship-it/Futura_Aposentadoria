"use server";

import { revalidatePath } from "next/cache";
import type { EmploymentType, PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { formatDate, onlyDigits } from "@/lib/format";
import { monthRange, parseDateInput, paymentMethods, today } from "@/lib/finance";
import {
  activeInMonth,
  employment,
  employmentTypes,
  nthBusinessDay,
  obligationDueDate,
  obligationExpenseCategory,
  obligationKinds,
  taxRegimes,
} from "@/lib/accounting";
import type { FormState } from "../financeiro/actions";

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function wholeNumber(formData: FormData, key: string) {
  const raw = text(formData, key);
  if (raw === null) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// Campo de dinheiro opcional: vazio vira 0; valor inválido vira null.
function optionalMoney(formData: FormData, key: string) {
  const raw = text(formData, key);
  return raw === null ? 0 : parseMoney(raw);
}

async function requireAccounting() {
  return requireUser("contabilidade");
}

function revalidateAccounting() {
  revalidatePath("/contabilidade", "layout");
  revalidatePath("/financeiro", "layout");
}

// ---------- Contrato de trabalho ----------

// A pessoa é cadastrada em "Cadastro de servidores"; aqui só entram os dados do contrato.
export async function saveContract(userId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAccounting();
  const person = await prisma.user.findFirst({ where: { id: userId, clinicId: user.clinicId } });
  if (!person) return { error: "Pessoa não encontrada." };
  const type = text(formData, "type") as EmploymentType;
  if (!employmentTypes.includes(type)) return { error: "Escolha o tipo de vínculo." };
  const admissionDate = parseDateInput(text(formData, "admissionDate") ?? "");
  if (!admissionDate) return { error: "Informe a data de admissão." };
  const salaryCents = parseMoney(text(formData, "salary") ?? "");
  if (!salaryCents) return { error: "Informe o salário (ex.: 2.500,00)." };
  const weeklyHours = wholeNumber(formData, "weeklyHours");
  if (weeklyHours === null || weeklyHours > 60) return { error: "Carga horária semanal inválida." };

  const data = {
    type,
    admissionDate,
    salaryCents,
    weeklyHours: weeklyHours || null,
    pis: onlyDigits(text(formData, "pis")) || null,
    paymentInfo: text(formData, "paymentInfo"),
    notes: text(formData, "notes"),
  };
  const contract = await prisma.employmentContract.upsert({
    where: { userId },
    create: { ...data, clinicId: user.clinicId, userId },
    update: data,
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONTRATO_SALVO", entity: "EmploymentContract", entityId: contract.id, details: { userId } });
  revalidateAccounting();
  return { error: "", ok: "Contrato salvo." };
}

// ---------- Férias ----------

export async function addVacation(contractId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAccounting();
  const contract = await prisma.employmentContract.findFirst({ where: { id: contractId, clinicId: user.clinicId } });
  if (!contract) return { error: "Contrato não encontrado." };
  const startDate = parseDateInput(text(formData, "startDate") ?? "");
  const endDate = parseDateInput(text(formData, "endDate") ?? "");
  if (!startDate || !endDate) return { error: "Informe o primeiro e o último dia das férias." };
  if (endDate < startDate) return { error: "O último dia precisa ser depois do primeiro." };
  if (startDate < contract.admissionDate) return { error: "As férias não podem ser antes da admissão." };
  const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  // A CLT permite dividir as férias em até 3 partes: uma de pelo menos 14 dias e as outras de pelo menos 5.
  if (days < 5) return { error: "Cada período de férias precisa ter pelo menos 5 dias." };
  if (days > 30) return { error: "Um período de férias tem no máximo 30 dias." };

  const vacation = await prisma.vacation.create({
    data: { clinicId: user.clinicId, contractId, startDate, endDate, notes: text(formData, "notes") },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "FERIAS_REGISTRADAS", entity: "Vacation", entityId: vacation.id, details: { days } });
  revalidateAccounting();
  return { error: "", ok: `Férias de ${days} dias registradas.` };
}

export async function deleteVacation(vacationId: string) {
  const user = await requireAccounting();
  const { count } = await prisma.vacation.deleteMany({ where: { id: vacationId, clinicId: user.clinicId } });
  if (count === 0) throw new Error("Férias não encontradas");
  await audit({ clinicId: user.clinicId, userId: user.id, action: "FERIAS_APAGADAS", entity: "Vacation", entityId: vacationId });
  revalidateAccounting();
}

// ---------- Folha do mês ----------

export async function savePayrollEntry(contractId: string, month: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAccounting();
  const range = monthRange(month);
  const contract = await prisma.employmentContract.findFirst({ where: { id: contractId, clinicId: user.clinicId } });
  if (!contract) return { error: "Contrato não encontrado." };

  const absenceDays = wholeNumber(formData, "absenceDays");
  const overtimeHours = wholeNumber(formData, "overtimeHours");
  if (absenceDays === null || absenceDays > 31) return { error: "Faltas: informe o número de dias." };
  if (overtimeHours === null || overtimeHours > 200) return { error: "Horas extras: informe um número inteiro de horas." };
  const additionsCents = optionalMoney(formData, "additions");
  const deductionsCents = optionalMoney(formData, "deductions");
  if (additionsCents === null || deductionsCents === null) return { error: "Valor inválido (ex.: 150,00)." };
  const netRaw = text(formData, "net");
  const netCents = netRaw === null ? null : parseMoney(netRaw);
  if (netRaw !== null && !netCents) return { error: "Líquido inválido (ex.: 2.150,00)." };

  const data = { absenceDays, overtimeHours, additionsCents, deductionsCents, netCents, notes: text(formData, "notes") };
  const entry = await prisma.payrollEntry.upsert({
    where: { contractId_month: { contractId, month: range.month } },
    create: { ...data, clinicId: user.clinicId, contractId, month: range.month, baseCents: contract.salaryCents },
    update: data,
  });
  // Se o salário já foi lançado e ainda não foi pago, a despesa acompanha o novo valor.
  if (entry.expenseId) {
    await prisma.expense.updateMany({
      where: { id: entry.expenseId, clinicId: user.clinicId, status: "PENDENTE" },
      data: {
        amountCents: netCents ?? entry.baseCents + additionsCents - deductionsCents,
        notes: netCents ? "Líquido informado pelo contador" : "Valor bruto: ajuste quando o contador mandar o líquido",
      },
    });
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "FOLHA_ALTERADA", entity: "EmploymentContract", entityId: contractId, details: { month: range.month } });
  revalidateAccounting();
  return { error: "", ok: "Salvo." };
}

// Valor a pagar: o líquido que o contador mandou; sem ele, o bruto (salário + extras - descontos).
export async function launchPayroll(month: string) {
  const user = await requireAccounting();
  const range = monthRange(month);
  const employees = await prisma.employmentContract.findMany({
    where: { clinicId: user.clinicId },
    include: { user: true, payrollEntries: { where: { month: range.month } } },
    orderBy: { user: { name: "asc" } },
  });
  // Vence no 5º dia útil do mês seguinte.
  const dueDate = nthBusinessDay(range.next, 5);
  let launched = 0;
  for (const e of employees) {
    if (!activeInMonth(employment(e), range)) continue;
    const entry = e.payrollEntries[0];
    if (entry?.expenseId) continue;
    const base = entry?.baseCents ?? e.salaryCents;
    const amountCents = entry?.netCents ?? base + (entry?.additionsCents ?? 0) - (entry?.deductionsCents ?? 0);
    if (amountCents <= 0) continue;
    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          clinicId: user.clinicId,
          description: `Salário ${e.user.name} (${range.label})`,
          category: "Salários e encargos",
          amountCents,
          dueDate,
          notes: entry?.netCents ? "Líquido informado pelo contador" : "Valor bruto: ajuste quando o contador mandar o líquido",
        },
      });
      await tx.payrollEntry.upsert({
        where: { contractId_month: { contractId: e.id, month: range.month } },
        create: { clinicId: user.clinicId, contractId: e.id, month: range.month, baseCents: base, expenseId: expense.id },
        update: { expenseId: expense.id },
      });
    });
    launched++;
  }
  if (launched === 0) throw new Error("Não há salários a lançar neste mês");
  await audit({ clinicId: user.clinicId, userId: user.id, action: "FOLHA_LANCADA", entity: "PayrollEntry", details: { month: range.month, launched } });
  revalidateAccounting();
}

// ---------- Obrigações do mês ----------

export async function completeObligation(obligationId: string, month: string, formData: FormData) {
  const user = await requireAccounting();
  const range = monthRange(month);
  const obligation = await prisma.taxObligation.findFirst({ where: { id: obligationId, clinicId: user.clinicId } });
  if (!obligation) throw new Error("Obrigação não encontrada");
  const doneAt = parseDateInput(text(formData, "doneAt") ?? "") ?? today();
  const amountRaw = text(formData, "amount");
  const amountCents = amountRaw === null ? null : parseMoney(amountRaw);
  if (amountRaw !== null && !amountCents) throw new Error("Valor inválido");
  const methodRaw = text(formData, "paymentMethod");
  const paymentMethod = paymentMethods.includes(methodRaw as PaymentMethod) ? (methodRaw as PaymentMethod) : null;

  const due = obligationDueDate(obligation, range.month) ?? doneAt;
  await prisma.$transaction(async (tx) => {
    // Se informou o valor pago, a guia entra como despesa paga no Financeiro.
    const expense = amountCents
      ? await tx.expense.create({
          data: {
            clinicId: user.clinicId,
            description: `${obligation.name} (vencimento ${formatDate(due)})`,
            category: obligationExpenseCategory(obligation.kind),
            amountCents,
            dueDate: due,
            status: "PAGO",
            paymentMethod,
            paidAt: doneAt,
          },
        })
      : null;
    await tx.obligationEntry.create({
      data: {
        clinicId: user.clinicId,
        obligationId,
        month: range.month,
        doneAt,
        amountCents,
        expenseId: expense?.id,
        notes: text(formData, "notes"),
      },
    });
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "OBRIGACAO_CUMPRIDA", entity: "TaxObligation", entityId: obligationId, details: { month: range.month, amountCents } });
  revalidateAccounting();
}

export async function undoObligation(entryId: string) {
  const user = await requireAccounting();
  const entry = await prisma.obligationEntry.findFirst({ where: { id: entryId, clinicId: user.clinicId } });
  if (!entry) throw new Error("Registro não encontrado");
  await prisma.$transaction(async (tx) => {
    // A despesa criada junto é cancelada (não apagada), para o Financeiro manter o histórico.
    if (entry.expenseId) {
      await tx.expense.updateMany({ where: { id: entry.expenseId, clinicId: user.clinicId }, data: { status: "CANCELADO" } });
    }
    await tx.obligationEntry.delete({ where: { id: entry.id } });
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "OBRIGACAO_DESFEITA", entity: "TaxObligation", entityId: entry.obligationId, details: { month: entry.month } });
  revalidateAccounting();
}

export async function createObligation(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAccounting();
  const name = text(formData, "name");
  if (!name) return { error: "Informe o nome da obrigação." };
  const kind = text(formData, "kind");
  if (!obligationKinds.includes(kind as (typeof obligationKinds)[number])) return { error: "Escolha o tipo." };
  const dueDay = Number(text(formData, "dueDay"));
  const businessDay = formData.get("businessDay") === "on";
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > (businessDay ? 22 : 31)) return { error: "Dia de vencimento inválido." };
  const onlyMonthRaw = text(formData, "onlyMonth");
  const onlyMonth = onlyMonthRaw ? Number(onlyMonthRaw) : null;
  if (onlyMonth !== null && !(onlyMonth >= 1 && onlyMonth <= 12)) return { error: "Mês inválido." };

  const obligation = await prisma.taxObligation.create({
    data: { clinicId: user.clinicId, name: name.slice(0, 120), kind: kind!, dueDay, businessDay, onlyMonth, hint: text(formData, "hint") },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "OBRIGACAO_ALTERADA", entity: "TaxObligation", entityId: obligation.id, details: { created: true } });
  revalidateAccounting();
  return { error: "", ok: "Obrigação cadastrada." };
}

export async function toggleObligation(obligationId: string) {
  const user = await requireAccounting();
  const obligation = await prisma.taxObligation.findFirst({ where: { id: obligationId, clinicId: user.clinicId } });
  if (!obligation) throw new Error("Obrigação não encontrada");
  await prisma.taxObligation.update({ where: { id: obligation.id }, data: { active: !obligation.active } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "OBRIGACAO_ALTERADA", entity: "TaxObligation", entityId: obligation.id, details: { active: !obligation.active } });
  revalidateAccounting();
}

// ---------- Contador ----------

export async function saveAccountant(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAccounting();
  const taxRegime = text(formData, "taxRegime");
  if (taxRegime && !taxRegimes.includes(taxRegime)) return { error: "Regime inválido." };
  const cnpj = onlyDigits(text(formData, "cnpj")) || null;
  if (cnpj && cnpj.length !== 14) return { error: "O CNPJ deve ter 14 números." };
  await prisma.clinic.update({
    where: { id: user.clinicId },
    data: {
      cnpj,
      taxRegime,
      accountantName: text(formData, "accountantName"),
      accountantEmail: text(formData, "accountantEmail"),
      accountantPhone: onlyDigits(text(formData, "accountantPhone")) || null,
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONTADOR_ALTERADO", entity: "Clinic", entityId: user.clinicId });
  revalidateAccounting();
  return { error: "", ok: "Dados salvos." };
}
