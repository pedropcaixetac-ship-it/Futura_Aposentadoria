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
import { accidentIndications, careRegime, claimNumberLabel, consultationTypes, missingForClaim, normalizeCbo, parseClaimPayments } from "@/lib/tiss";
import { MAX_CLAIMS_PER_BATCH, TISS_VERSION } from "@/lib/tiss-xml";
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
    include: { patient: { include: { healthPlan: true } }, professional: true, clinic: true, teleconsultation: { select: { id: true } } },
  });
  if (!encounter) return { error: "Atendimento não encontrado ou ainda não finalizado." };
  const plan = encounter.patient.healthPlan;
  if (!plan) return { error: "O paciente não tem convênio cadastrado na ficha." };

  const missing = missingForClaim({ clinic: encounter.clinic, plan, professional: encounter.professional });
  if (missing.length > 0) return { error: `Falta no cadastro: ${missing.join("; ")}.` };

  const open = await prisma.insuranceClaim.findFirst({ where: { clinicId: user.clinicId, encounterId, status: "ABERTA" } });
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
        careRegime: careRegime(!!encounter.teleconsultation),
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
    where: { id: claimId, clinicId: user.clinicId, status: "ABERTA", batchId: null },
    data: { status: "CANCELADA", canceledAt: new Date() },
  });
  if (count === 0) throw new Error("Guia não encontrada, já cancelada ou já enviada em lote");
  await audit({ clinicId: user.clinicId, userId: user.id, action: "GUIA_CANCELADA", entity: "InsuranceClaim", entityId: claimId });
  revalidatePath("/financeiro", "layout");
}

// Fecha um lote com as guias de um convênio que ainda não foram enviadas (as mais antigas primeiro).
export async function closeBatch(healthPlanId: string) {
  const user = await requireAdmin();
  const plan = await prisma.healthPlan.findFirst({ where: { id: healthPlanId, clinicId: user.clinicId } });
  if (!plan) throw new Error("Convênio não encontrado");
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: user.clinicId } });
  if (!plan.ansCode || !clinic.cnes || (!plan.providerCode && !clinic.cnpj)) throw new Error("Cadastro do convênio ou da clínica incompleto");

  const batch = await prisma.$transaction(async (tx) => {
    const claims = await tx.insuranceClaim.findMany({
      where: { clinicId: user.clinicId, healthPlanId, status: "ABERTA", batchId: null },
      orderBy: { number: "asc" },
      take: MAX_CLAIMS_PER_BATCH,
      select: { id: true },
    });
    if (claims.length === 0) throw new Error("Não há guias a enviar para este convênio");
    const { lastBatchNumber } = await tx.clinic.update({ where: { id: user.clinicId }, data: { lastBatchNumber: { increment: 1 } } });
    const created = await tx.claimBatch.create({
      data: { clinicId: user.clinicId, healthPlanId, number: lastBatchNumber, tissVersion: TISS_VERSION },
    });
    const { count } = await tx.insuranceClaim.updateMany({
      where: { clinicId: user.clinicId, id: { in: claims.map((c) => c.id) }, status: "ABERTA", batchId: null },
      data: { batchId: created.id },
    });
    if (count !== claims.length) throw new Error("Outra pessoa mexeu nas guias ao mesmo tempo. Tente de novo.");
    return { ...created, size: count };
  });

  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "LOTE_FECHADO",
    entity: "ClaimBatch",
    entityId: batch.id,
    details: { number: batch.number, healthPlan: plan.name, guias: batch.size },
  });
  revalidatePath("/financeiro", "layout");
  redirect(`/financeiro/faturamento/lotes/${batch.id}`);
}

// Desfaz o lote (por exemplo, se o portal do convênio recusou o arquivo): as guias voltam a ficar a enviar.
export async function undoBatch(batchId: string) {
  const user = await requireAdmin();
  const batch = await prisma.claimBatch.findFirst({ where: { id: batchId, clinicId: user.clinicId } });
  if (!batch) throw new Error("Lote não encontrado");
  if (batch.paidAt) throw new Error("Lote já pago não pode ser desfeito");
  await prisma.$transaction([
    prisma.insuranceClaim.updateMany({ where: { clinicId: user.clinicId, batchId }, data: { batchId: null } }),
    prisma.claimBatch.delete({ where: { id: batchId } }),
  ]);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_DESFEITO", entity: "ClaimBatch", entityId: batchId, details: { number: batch.number } });
  revalidatePath("/financeiro", "layout");
  redirect("/financeiro/faturamento");
}

// Número de protocolo que o portal do convênio deu ao receber o arquivo.
export async function saveBatchProtocol(batchId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const protocol = text(formData, "protocol")?.slice(0, 40) ?? null;
  const { count } = await prisma.claimBatch.updateMany({ where: { id: batchId, clinicId: user.clinicId }, data: { protocol } });
  if (count === 0) return { error: "Lote não encontrado." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_PROTOCOLO", entity: "ClaimBatch", entityId: batchId, details: { protocol } });
  revalidatePath("/financeiro", "layout");
  return { error: "", ok: "Protocolo salvo." };
}

// Conferência do pagamento do lote: o que o convênio pagou em cada guia vira receita paga no Financeiro
// (forma de pagamento Convênio), e o que não pagou fica registrado como glosa, com o motivo.
export async function registerBatchPayment(batchId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const batch = await prisma.claimBatch.findFirst({
    where: { id: batchId, clinicId: user.clinicId },
    include: { healthPlan: true, claims: { orderBy: { number: "asc" } } },
  });
  if (!batch) return { error: "Lote não encontrado." };
  if (batch.paidAt) return { error: "O pagamento deste lote já foi registrado." };
  const paidAt = parseDateInput(text(formData, "paidAt") ?? "");
  if (!paidAt) return { error: "Informe a data do pagamento." };
  const parsed = parseClaimPayments((key) => text(formData, key), batch.claims, parseMoney);
  if ("error" in parsed) return parsed;

  const byId = new Map(batch.claims.map((c) => [c.id, c]));
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.claimBatch.updateMany({ where: { id: batch.id, clinicId: user.clinicId, paidAt: null }, data: { paidAt } });
    if (count === 0) throw new Error("O pagamento deste lote já foi registrado.");
    for (const payment of parsed.payments) {
      const claim = byId.get(payment.id)!;
      const charge = payment.paidCents > 0
        ? await tx.charge.create({
            data: {
              clinicId: user.clinicId,
              patientId: claim.patientId,
              professionalId: claim.professionalId,
              encounterId: claim.encounterId,
              description: `${batch.healthPlan.name} · guia ${claimNumberLabel(claim.number)}`,
              amountCents: payment.paidCents,
              dueDate: paidAt,
              status: "PAGO",
              paymentMethod: "CONVENIO",
              paidAt,
            },
          })
        : null;
      await tx.insuranceClaim.updateMany({
        where: { id: claim.id, clinicId: user.clinicId },
        data: { paidCents: payment.paidCents, glossReason: payment.glossReason, chargeId: charge?.id ?? null },
      });
    }
  });

  const paid = parsed.payments.reduce((t, p) => t + p.paidCents, 0);
  const total = batch.claims.reduce((t, c) => t + c.amountCents, 0);
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "LOTE_PAGO",
    entity: "ClaimBatch",
    entityId: batch.id,
    details: { number: batch.number, paidCents: paid, glossCents: total - paid },
  });
  revalidatePath("/financeiro", "layout");
  return { error: "", ok: "Pagamento registrado. O valor recebido já aparece nas Receitas." };
}
