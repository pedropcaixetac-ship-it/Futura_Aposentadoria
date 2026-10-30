"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canManageFinance } from "@/lib/permissions";
import { parseMoney } from "@/lib/money";
import { parseDateInput } from "@/lib/finance";
import { normalizeTussCode } from "@/lib/convenios";
import { accidentIndications, consultationTypes, missingForClaim, normalizeCbo } from "@/lib/tiss";
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

// Gera a guia de consulta de um atendimento finalizado de paciente com convênio cadastrado.
export async function createClaim(encounterId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, clinicId: user.clinicId, status: "FINALIZADO" },
    include: { patient: { include: { healthPlan: true } }, professional: true, clinic: true },
  });
  if (!encounter) return { error: "Atendimento não encontrado ou ainda não finalizado." };
  const plan = encounter.patient.healthPlan;
  if (!plan) return { error: "O paciente não tem convênio cadastrado na ficha." };

  const missing = missingForClaim({ clinic: encounter.clinic, plan, professional: encounter.professional });
  if (missing.length > 0) return { error: `Falta no cadastro: ${missing.join("; ")}.` };

  const open = await prisma.insuranceClaim.findFirst({ where: { encounterId, status: "ABERTA" } });
  if (open) return { error: "Este atendimento já tem guia. Cancele a anterior para gerar outra." };

  const cardNumber = text(formData, "cardNumber")?.replace(/\s/g, "");
  if (!cardNumber) return { error: "Informe o número da carteirinha." };
  const cardValidUntil = text(formData, "cardValidUntil") ? parseDateInput(text(formData, "cardValidUntil")!) : null;
  const serviceDate = parseDateInput(text(formData, "serviceDate") ?? "");
  if (!serviceDate) return { error: "Informe a data do atendimento." };
  const cbo = normalizeCbo(text(formData, "cbo"));
  if (!cbo) return { error: "O CBO do profissional tem 6 números (ex.: 225125 para médico clínico)." };
  const consultationType = Number(text(formData, "consultationType"));
  if (!consultationTypes.some((t) => t.value === consultationType)) return { error: "Escolha o tipo de consulta." };
  const accidentIndication = Number(text(formData, "accidentIndication") ?? "9");
  if (!accidentIndications.some((a) => a.value === accidentIndication)) return { error: "Escolha a indicação de acidente." };
  const tussCode = normalizeTussCode(text(formData, "tussCode") ?? "");
  if (!tussCode) return { error: "Escolha o procedimento." };
  const price = await prisma.healthPlanPrice.findUnique({ where: { healthPlanId_tussCode: { healthPlanId: plan.id, tussCode } } });
  if (!price) return { error: "Este procedimento não está na tabela do convênio." };
  const amountCents = parseMoney(text(formData, "amount") ?? "");
  if (!amountCents) return { error: "Informe um valor válido (ex.: 150,00)." };

  // Número da guia e gravação numa única operação, para duas guias ao mesmo tempo não pegarem o mesmo número.
  const claim = await prisma.$transaction(async (tx) => {
    const { lastClaimNumber } = await tx.clinic.update({ where: { id: user.clinicId }, data: { lastClaimNumber: { increment: 1 } } });
    return tx.insuranceClaim.create({
      data: {
        clinicId: user.clinicId,
        healthPlanId: plan.id,
        patientId: encounter.patientId,
        professionalId: encounter.professionalId,
        encounterId,
        number: lastClaimNumber,
        operatorNumber: text(formData, "operatorNumber")?.slice(0, 20) ?? null,
        cardNumber: cardNumber.slice(0, 20),
        cardValidUntil,
        newborn: formData.get("newborn") === "on",
        serviceDate,
        consultationType,
        accidentIndication,
        cbo,
        tussCode,
        description: price.description,
        amountCents,
        notes: text(formData, "notes")?.slice(0, 500) ?? null,
      },
    });
  });

  // A carteirinha digitada na guia passa a valer na ficha do paciente.
  if (encounter.patient.insuranceNumber !== claim.cardNumber || (cardValidUntil && encounter.patient.insuranceValidUntil?.getTime() !== cardValidUntil.getTime())) {
    await prisma.patient.update({
      where: { id: encounter.patientId },
      data: { insuranceNumber: claim.cardNumber, ...(cardValidUntil && { insuranceValidUntil: cardValidUntil }) },
    });
  }

  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "GUIA_EMITIDA",
    entity: "InsuranceClaim",
    entityId: claim.id,
    patientId: claim.patientId,
    details: { number: claim.number, healthPlan: plan.name, tussCode, amountCents },
  });
  revalidatePath("/financeiro", "layout");
  redirect(`/financeiro/faturamento/${claim.id}`);
}

export async function cancelClaim(claimId: string) {
  const user = await requireAdmin();
  const { count } = await prisma.insuranceClaim.updateMany({
    where: { id: claimId, clinicId: user.clinicId, status: "ABERTA" },
    data: { status: "CANCELADA", canceledAt: new Date() },
  });
  if (count === 0) throw new Error("Guia não encontrada ou já cancelada");
  await audit({ clinicId: user.clinicId, userId: user.id, action: "GUIA_CANCELADA", entity: "InsuranceClaim", entityId: claimId });
  revalidatePath("/financeiro", "layout");
}
