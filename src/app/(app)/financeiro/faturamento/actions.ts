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
import {
  accidentIndications, careRegime, claimNumberLabel, consultationTypes, glossCents, missingForClaim, normalizeCbo, parseClaimItems, parseClaimPayments,
  parseRecovered, serviceTypes,
  type ClaimItemInput,
} from "@/lib/tiss";
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

// Gera a guia (de consulta ou SP/SADT) de um atendimento finalizado de paciente com convênio cadastrado.
export async function createClaim(encounterId: string, kind: "CONSULTA" | "SPSADT", _: FormState, formData: FormData): Promise<FormState> {
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

  // Um atendimento pode ter uma guia de consulta e uma SP/SADT (por exemplo, consulta e eletrocardiograma no mesmo dia).
  const open = await prisma.insuranceClaim.findFirst({ where: { clinicId: user.clinicId, encounterId, kind, status: "ABERTA" } });
  if (open) return { error: "Este atendimento já tem guia deste tipo. Cancele a anterior para gerar outra." };

  const cardNumber = text(formData, "cardNumber")?.replace(/\s/g, "");
  if (!cardNumber) return { error: "Informe o número da carteirinha." };
  const cardValidUntil = text(formData, "cardValidUntil") ? parseDateInput(text(formData, "cardValidUntil")!) : null;
  const serviceDate = parseDateInput(text(formData, "serviceDate") ?? "");
  if (!serviceDate) return { error: "Informe a data do atendimento." };
  const cbo = normalizeCbo(text(formData, "cbo"));
  if (!cbo) return { error: "O CBO do profissional tem 6 números (ex.: 225125 para médico clínico)." };
  const accidentIndication = Number(text(formData, "accidentIndication") ?? "9");
  if (!accidentIndications.some((a) => a.value === accidentIndication)) return { error: "Escolha a indicação de acidente." };
  const details = kind === "SPSADT" ? await sadtDetails(plan.id, formData) : await consultationDetails(plan.id, formData);
  if ("error" in details) return details;

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
        kind,
        accidentIndication,
        careRegime: careRegime(!!encounter.teleconsultation),
        cbo,
        ...details.claim,
        notes: text(formData, "notes")?.slice(0, 500) ?? null,
        items: { create: details.items.map((item) => ({ ...item, clinicId: user.clinicId })) },
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
    details: { number: claim.number, tipo: kind, healthPlan: plan.name, tussCode: claim.tussCode, amountCents: claim.amountCents },
  });
  revalidatePath("/financeiro", "layout");
  redirect(`/financeiro/faturamento/${claim.id}`);
}

type ClaimDetails = {
  claim: {
    consultationType?: number;
    tussCode: string;
    description: string;
    amountCents: number;
    serviceType?: string;
    urgent?: boolean;
    clinicalIndication?: string | null;
    requestDate?: Date | null;
    authorizationDate?: Date | null;
    authorizationCode?: string | null;
  };
  items: ClaimItemInput[];
};

// Guia de consulta: tipo de consulta e um único procedimento, com o valor da tabela (que pode ser ajustado).
async function consultationDetails(healthPlanId: string, formData: FormData): Promise<ClaimDetails | { error: string }> {
  const consultationType = Number(text(formData, "consultationType"));
  if (!consultationTypes.some((t) => t.value === consultationType)) return { error: "Escolha o tipo de consulta." };
  const tussCode = normalizeTussCode(text(formData, "tussCode") ?? "");
  if (!tussCode) return { error: "Escolha o procedimento." };
  const price = await prisma.healthPlanPrice.findUnique({ where: { healthPlanId_tussCode: { healthPlanId, tussCode } } });
  if (!price) return { error: "Este procedimento não está na tabela do convênio." };
  const amountCents = parseMoney(text(formData, "amount") ?? "");
  if (!amountCents) return { error: "Informe um valor válido (ex.: 150,00)." };
  return { claim: { consultationType, tussCode, description: price.description, amountCents }, items: [] };
}

// Guia SP/SADT: vários exames ou procedimentos, mais os dados do pedido e da autorização do convênio.
async function sadtDetails(healthPlanId: string, formData: FormData): Promise<ClaimDetails | { error: string }> {
  const serviceType = text(formData, "serviceType") ?? "";
  if (!serviceTypes.some((t) => t.value === serviceType)) return { error: "Escolha o tipo de atendimento." };
  const prices = await prisma.healthPlanPrice.findMany({ where: { healthPlanId }, select: { tussCode: true, description: true } });
  const parsed = parseClaimItems((key) => text(formData, key), prices, parseMoney, normalizeTussCode);
  if ("error" in parsed) return parsed;
  const authorizationCode = text(formData, "authorizationCode")?.slice(0, 20) ?? null;
  const authorizationDate = text(formData, "authorizationDate") ? parseDateInput(text(formData, "authorizationDate")!) : null;
  if ((authorizationCode || text(formData, "operatorNumber")) && !authorizationDate) {
    return { error: "Informe a data da autorização do convênio." };
  }
  const requestDate = text(formData, "requestDate") ? parseDateInput(text(formData, "requestDate")!) : null;
  const [first] = parsed.items;
  return {
    claim: {
      tussCode: first.tussCode,
      description: parsed.items.length > 1 ? `${first.description} e mais ${parsed.items.length - 1}` : first.description,
      amountCents: parsed.items.reduce((t, i) => t + i.totalCents, 0),
      serviceType,
      urgent: formData.get("urgent") === "on",
      clinicalIndication: text(formData, "clinicalIndication")?.slice(0, 500) ?? null,
      requestDate,
      authorizationDate,
      authorizationCode,
    },
    items: parsed.items,
  };
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
export async function closeBatch(healthPlanId: string, kind: "CONSULTA" | "SPSADT") {
  const user = await requireAdmin();
  const plan = await prisma.healthPlan.findFirst({ where: { id: healthPlanId, clinicId: user.clinicId } });
  if (!plan) throw new Error("Convênio não encontrado");
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: user.clinicId } });
  if (!plan.ansCode || !clinic.cnes || (!plan.providerCode && !clinic.cnpj)) throw new Error("Cadastro do convênio ou da clínica incompleto");

  const batch = await prisma.$transaction(async (tx) => {
    const claims = await tx.insuranceClaim.findMany({
      where: { clinicId: user.clinicId, healthPlanId, kind, status: "ABERTA", batchId: null },
      orderBy: { number: "asc" },
      take: MAX_CLAIMS_PER_BATCH,
      select: { id: true },
    });
    if (claims.length === 0) throw new Error("Não há guias a enviar para este convênio");
    const { lastBatchNumber } = await tx.clinic.update({ where: { id: user.clinicId }, data: { lastBatchNumber: { increment: 1 } } });
    const created = await tx.claimBatch.create({
      data: { clinicId: user.clinicId, healthPlanId, kind, number: lastBatchNumber, tissVersion: TISS_VERSION },
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
    details: { number: batch.number, tipo: kind, healthPlan: plan.name, guias: batch.size },
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

// Recurso de glosa: registra a contestação enviada ao convênio (motivo, data e protocolo).
export async function createAppeal(claimId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const claim = await prisma.insuranceClaim.findFirst({ where: { id: claimId, clinicId: user.clinicId }, include: { appeal: true } });
  if (!claim || glossCents(claim) === 0) return { error: "Esta guia não tem glosa para recorrer." };
  if (claim.appeal) return { error: "Esta guia já tem recurso registrado." };
  const reason = text(formData, "reason")?.slice(0, 2000);
  if (!reason) return { error: "Escreva a justificativa do recurso." };
  const sentAt = parseDateInput(text(formData, "sentAt") ?? "");
  if (!sentAt) return { error: "Informe a data de envio do recurso." };
  const appeal = await prisma.claimAppeal.create({
    data: { clinicId: user.clinicId, claimId, reason, sentAt, protocol: text(formData, "protocol")?.slice(0, 40) ?? null },
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "RECURSO_ENVIADO",
    entity: "ClaimAppeal",
    entityId: appeal.id,
    patientId: claim.patientId,
    details: { guia: claim.number, glossCents: glossCents(claim) },
  });
  revalidatePath("/financeiro", "layout");
  return { error: "", ok: "Recurso registrado." };
}

// Resposta do convênio ao recurso: o valor recuperado vira receita paga no Financeiro (forma Convênio).
export async function resolveAppeal(appealId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const appeal = await prisma.claimAppeal.findFirst({
    where: { id: appealId, clinicId: user.clinicId },
    include: { claim: { include: { healthPlan: true } } },
  });
  if (!appeal) return { error: "Recurso não encontrado." };
  if (appeal.resolvedAt) return { error: "A resposta deste recurso já foi registrada." };
  const resolvedAt = parseDateInput(text(formData, "resolvedAt") ?? "");
  if (!resolvedAt) return { error: "Informe a data da resposta do convênio." };
  const { claim } = appeal;
  const recovered = parseRecovered(text(formData, "recovered") ?? "", glossCents(claim), parseMoney);
  if ("error" in recovered) return recovered;

  await prisma.$transaction(async (tx) => {
    const charge = recovered.cents > 0
      ? await tx.charge.create({
          data: {
            clinicId: user.clinicId,
            patientId: claim.patientId,
            professionalId: claim.professionalId,
            encounterId: claim.encounterId,
            description: `${claim.healthPlan.name} · recurso da guia ${claimNumberLabel(claim.number)}`,
            amountCents: recovered.cents,
            dueDate: resolvedAt,
            status: "PAGO",
            paymentMethod: "CONVENIO",
            paidAt: resolvedAt,
          },
        })
      : null;
    const { count } = await tx.claimAppeal.updateMany({
      where: { id: appeal.id, clinicId: user.clinicId, resolvedAt: null },
      data: { resolvedAt, recoveredCents: recovered.cents, chargeId: charge?.id ?? null },
    });
    if (count === 0) throw new Error("A resposta deste recurso já foi registrada.");
  });

  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "RECURSO_RESPONDIDO",
    entity: "ClaimAppeal",
    entityId: appeal.id,
    patientId: claim.patientId,
    details: { guia: claim.number, recoveredCents: recovered.cents },
  });
  revalidatePath("/financeiro", "layout");
  return { error: "", ok: recovered.cents > 0 ? "Resposta registrada. O valor recuperado já aparece nas Receitas." : "Resposta registrada: recurso negado." };
}
