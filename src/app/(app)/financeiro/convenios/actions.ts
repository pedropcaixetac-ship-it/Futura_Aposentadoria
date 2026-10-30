"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canManageFinance } from "@/lib/permissions";
import { parseMoney } from "@/lib/money";
import { normalizeAnsCode, normalizeCnes, normalizeTussCode, parseDays, parsePriceList } from "@/lib/convenios";
import type { FormState } from "../actions";

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

async function requireAdmin() {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) throw new Error("Sem permissão");
  return user;
}

async function findPlan(clinicId: string, planId: string) {
  const plan = await prisma.healthPlan.findFirst({ where: { id: planId, clinicId } });
  if (!plan) throw new Error("Convênio não encontrado");
  return plan;
}

function revalidatePlans() {
  revalidatePath("/financeiro/convenios", "layout");
}

// Lê e confere os dados do convênio digitados no formulário.
function planData(formData: FormData): { error: string } | { data: Omit<Prisma.HealthPlanUncheckedCreateInput, "clinicId"> } {
  const name = text(formData, "name");
  if (!name) return { error: "Informe o nome do convênio." };
  const ansRaw = text(formData, "ansCode");
  const ansCode = ansRaw ? normalizeAnsCode(ansRaw) : null;
  if (ansRaw && !ansCode) return { error: "O registro ANS tem 6 números (aparece na carteirinha do paciente)." };
  const paymentDays = parseDays(text(formData, "paymentDays") ?? "");
  const returnDays = parseDays(text(formData, "returnDays") ?? "");
  if (paymentDays === undefined || returnDays === undefined) return { error: "Os prazos são em dias (de 0 a 365)." };
  return {
    data: {
      name: name.slice(0, 120),
      ansCode,
      providerCode: text(formData, "providerCode")?.slice(0, 20) ?? null,
      paymentDays,
      returnDays,
      notes: text(formData, "notes")?.slice(0, 1000) ?? null,
    },
  };
}

function isDuplicate(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createHealthPlan(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = planData(formData);
  if ("error" in parsed) return parsed;
  let planId: string;
  try {
    const plan = await prisma.healthPlan.create({ data: { ...parsed.data, clinicId: user.clinicId } });
    planId = plan.id;
  } catch (error) {
    if (isDuplicate(error)) return { error: "Já existe um convênio com esse nome." };
    throw error;
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONVENIO_CRIADO", entity: "HealthPlan", entityId: planId, details: { name: parsed.data.name } });
  revalidatePlans();
  redirect(`/financeiro/convenios/${planId}`);
}

export async function updateHealthPlan(planId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  await findPlan(user.clinicId, planId);
  const parsed = planData(formData);
  if ("error" in parsed) return parsed;
  const active = formData.get("active") === "on";
  try {
    await prisma.$transaction([
      prisma.healthPlan.update({ where: { id: planId }, data: { ...parsed.data, active } }),
      // A ficha dos pacientes mostra o nome do convênio; acompanha se ele for renomeado.
      prisma.patient.updateMany({ where: { clinicId: user.clinicId, healthPlanId: planId }, data: { insurance: parsed.data.name } }),
    ]);
  } catch (error) {
    if (isDuplicate(error)) return { error: "Já existe um convênio com esse nome." };
    throw error;
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONVENIO_ALTERADO", entity: "HealthPlan", entityId: planId, details: { name: parsed.data.name, ansCode: parsed.data.ansCode ?? null, providerCode: parsed.data.providerCode ?? null, active } });
  revalidatePlans();
  return { error: "", ok: "Dados do convênio salvos." };
}

export async function updateClinicCnes(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const raw = text(formData, "cnes");
  const cnes = raw ? normalizeCnes(raw) : null;
  if (raw && !cnes) return { error: "O CNES tem 7 números." };
  await prisma.clinic.update({ where: { id: user.clinicId }, data: { cnes } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONVENIO_ALTERADO", entity: "Clinic", entityId: user.clinicId, details: { cnes } });
  revalidatePlans();
  return { error: "", ok: "CNES salvo." };
}

// Cadastra um procedimento ou, se o código já estiver na tabela deste convênio, atualiza o preço.
export async function addPlanPrice(planId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  await findPlan(user.clinicId, planId);
  const tussCode = normalizeTussCode(text(formData, "tussCode") ?? "");
  if (!tussCode) return { error: "O código TUSS tem 8 números (ex.: 10101012)." };
  const description = text(formData, "description");
  if (!description) return { error: "Informe a descrição do procedimento." };
  const priceCents = parseMoney(text(formData, "price") ?? "");
  if (!priceCents) return { error: "Informe um valor válido (ex.: 150,00)." };
  const data = { description: description.slice(0, 200), priceCents, active: true };
  await prisma.healthPlanPrice.upsert({
    where: { healthPlanId_tussCode: { healthPlanId: planId, tussCode } },
    create: { healthPlanId: planId, tussCode, ...data },
    update: data,
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONVENIO_PRECOS_ALTERADOS", entity: "HealthPlan", entityId: planId, details: { tussCode, priceCents } });
  revalidatePlans();
  return { error: "", ok: "Procedimento salvo." };
}

// Recebe a lista colada de uma vez. Só grava se todas as linhas estiverem certas,
// para a tabela não ficar pela metade.
export async function importPlanPrices(planId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  await findPlan(user.clinicId, planId);
  const { lines, errors } = parsePriceList(text(formData, "list") ?? "");
  if (errors.length > 0) {
    const more = errors.length > 5 ? ` E mais ${errors.length - 5} linha(s) com problema.` : "";
    return { error: `Nada foi gravado. ${errors.slice(0, 5).join(" ")}${more}` };
  }
  if (lines.length === 0) return { error: "Cole pelo menos uma linha." };
  await prisma.$transaction(
    lines.map(({ tussCode, description, priceCents }) =>
      prisma.healthPlanPrice.upsert({
        where: { healthPlanId_tussCode: { healthPlanId: planId, tussCode } },
        create: { healthPlanId: planId, tussCode, description, priceCents },
        update: { description, priceCents, active: true },
      }),
    ),
  );
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONVENIO_PRECOS_ALTERADOS", entity: "HealthPlan", entityId: planId, details: { imported: lines.length } });
  revalidatePlans();
  return { error: "", ok: `${lines.length} procedimento(s) gravado(s).` };
}

export async function updatePlanPrice(planId: string, priceId: string, formData: FormData) {
  const user = await requireAdmin();
  await findPlan(user.clinicId, planId);
  const priceCents = parseMoney(text(formData, "price") ?? "");
  if (!priceCents) throw new Error("Valor inválido");
  const active = formData.get("active") === "on";
  const { count } = await prisma.healthPlanPrice.updateMany({ where: { id: priceId, healthPlanId: planId }, data: { priceCents, active } });
  if (count === 0) throw new Error("Procedimento não encontrado");
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONVENIO_PRECOS_ALTERADOS", entity: "HealthPlanPrice", entityId: priceId, details: { priceCents, active } });
  revalidatePlans();
}
