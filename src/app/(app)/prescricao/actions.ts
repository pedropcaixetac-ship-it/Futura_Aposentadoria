"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type CheckStatus, type PrescriptionKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canViewClinical, canWorkClinical } from "@/lib/permissions";
import { isPhysician } from "@/lib/pronto-socorro";
import { FREQUENCIES, isDoseTime, kindLabel, localMidnight, prescriptionDayEnd, repeatableFromPreviousDay, repeatedStart, ROUTES } from "@/lib/prescricao";
import { withLock } from "@/lib/lock";

export type FormState = { error: string; ok?: string };
// Onde a prescrição vale: uma internação ou uma passagem pelo pronto-socorro.
export type RxContext = { kind: "internacao" | "ps"; id: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

// "2026-10-31T14:30" no horário de Brasília; vazio = agora.
function brasilia(value: string | null) {
  if (!value) return new Date();
  const d = new Date(`${value}:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getTime() + 3 * 3600 * 1000);
}

// Só com a internação ou a passagem pelo PS ainda aberta.
async function openContext(ctx: RxContext) {
  if (ctx.kind === "internacao") {
    const user = await requireUser("internacao");
    const admission = await prisma.admission.findFirst({ where: { id: ctx.id, clinicId: user.clinicId, dischargedAt: null } });
    if (!admission) throw new Error("Internação não encontrada ou já encerrada.");
    return { user, patientId: admission.patientId, link: { admissionId: admission.id }, path: `/internacao/${admission.id}/prescricao` };
  }
  const user = await requireUser("pronto-socorro");
  const visit = await prisma.emergencyVisit.findFirst({ where: { id: ctx.id, clinicId: user.clinicId, closedAt: null } });
  if (!visit) throw new Error("Paciente não está mais no pronto-socorro.");
  return { user, patientId: visit.patientId, link: { emergencyVisitId: visit.id }, path: `/pronto-socorro/${visit.id}` };
}

const KINDS = Object.keys(kindLabel) as PrescriptionKind[];

export async function addPrescriptionItem(ctx: RxContext, _: FormState, formData: FormData): Promise<FormState> {
  const { user, patientId, link, path } = await openContext(ctx);
  if (!isPhysician(user)) return { error: "Só o médico prescreve." };
  const kind = (text(formData, "kind") ?? "MEDICAMENTO") as PrescriptionKind;
  if (!KINDS.includes(kind)) return { error: "Escolha o tipo do item." };
  const description = text(formData, "description");
  if (!description) return { error: kind === "MEDICAMENTO" ? "Informe o medicamento." : "Descreva o item." };
  const route = text(formData, "route");
  if (route && !ROUTES.includes(route)) return { error: "Escolha a via." };
  if (kind === "MEDICAMENTO" && !route) return { error: "Informe a via do medicamento." };
  const frequency = FREQUENCIES.find((f) => f.value === (text(formData, "frequency") ?? "unica"));
  if (!frequency) return { error: "Escolha a frequência." };
  const startAt = brasilia(text(formData, "startAt"));
  if (!startAt) return { error: "Confira o horário de início." };

  const item = await prisma.prescriptionItem.create({
    data: {
      clinicId: user.clinicId,
      patientId,
      ...link,
      prescriberId: user.id,
      kind,
      description,
      dose: text(formData, "dose"),
      route,
      intervalHours: frequency.intervalHours,
      asNeeded: frequency.asNeeded,
      startAt,
      // A prescrição do dia vale até as 12h do dia seguinte. Depois o médico renova.
      endAt: prescriptionDayEnd(startAt),
      note: text(formData, "note"),
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRESCRICAO_ITEM", entity: "PrescriptionItem", entityId: item.id, patientId, details: { item: description } });
  revalidatePath(path);
  return { error: "", ok: `Prescrito: ${description}.` };
}

// "Repetir a prescrição de ontem": copia para hoje tudo o que valia ontem e não foi suspenso,
// seguindo os mesmos horários. Depois o médico suspende ou acrescenta o que mudou.
export async function repeatPreviousDay(ctx: RxContext): Promise<FormState> {
  const { user, patientId, link, path } = await openContext(ctx);
  if (!isPhysician(user)) return { error: "Só o médico prescreve." };
  const today = localMidnight(new Date());
  const created = await withLock([`prescricao:${ctx.id}`], async (tx) => {
    // Confere de novo dentro da trava: dois cliques seguidos não duplicam a prescrição.
    const items = await tx.prescriptionItem.findMany({
      where: { clinicId: user.clinicId, ...link },
      orderBy: { createdAt: "asc" },
    });
    const toCopy = repeatableFromPreviousDay(items, today);
    for (const item of toCopy) {
      const startAt = repeatedStart(item);
      await tx.prescriptionItem.create({
        data: {
          clinicId: user.clinicId,
          patientId,
          ...link,
          prescriberId: user.id,
          kind: item.kind,
          description: item.description,
          dose: item.dose,
          route: item.route,
          intervalHours: item.intervalHours,
          asNeeded: item.asNeeded,
          startAt,
          // Faz parte da prescrição de hoje: vale até as 12h de amanhã.
          endAt: prescriptionDayEnd(today),
          note: item.note,
        },
      });
    }
    return toCopy.length;
  });
  if (created === 0) return { error: "Não há nada de ontem para repetir." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRESCRICAO_REPETIDA", entity: ctx.kind === "internacao" ? "Admission" : "EmergencyVisit", entityId: ctx.id, patientId, details: { itens: created } });
  revalidatePath(path);
  return { error: "", ok: `Prescrição de ontem repetida: ${created} ${created === 1 ? "item" : "itens"}.` };
}

export async function suspendPrescriptionItem(ctx: RxContext, itemId: string, formData: FormData) {
  const { user, patientId, link, path } = await openContext(ctx);
  if (!isPhysician(user)) throw new Error("Só o médico suspende itens da prescrição.");
  const item = await prisma.prescriptionItem.findFirst({ where: { id: itemId, clinicId: user.clinicId, suspendedAt: null, ...link } });
  if (!item) return;
  await prisma.prescriptionItem.update({
    where: { id: item.id },
    data: { suspendedAt: new Date(), suspendedById: user.id, suspendReason: text(formData, "reason") ?? "Suspenso pelo médico" },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRESCRICAO_SUSPENSA", entity: "PrescriptionItem", entityId: item.id, patientId, details: { item: item.description } });
  revalidatePath(path);
}

function isDuplicate(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// Enfermagem checa um horário (ou uma dose "se necessário", sem horário). "Não feito" pede o motivo.
export async function checkDose(ctx: RxContext, itemId: string, scheduledIso: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const { user, patientId, link, path } = await openContext(ctx);
  if (!canWorkClinical(user)) return { error: "A checagem é feita pela enfermagem." };
  const item = await prisma.prescriptionItem.findFirst({ where: { id: itemId, clinicId: user.clinicId, ...link } });
  if (!item) return { error: "Item não encontrado." };
  const status = text(formData, "status") as CheckStatus | null;
  if (status !== "FEITO" && status !== "NAO_FEITO") return { error: "Escolha feito ou não feito." };
  const note = text(formData, "note");
  if (status === "NAO_FEITO" && !note) return { error: "Informe o motivo de não ter feito (ex.: paciente recusou, jejum)." };
  const scheduledAt = scheduledIso ? new Date(scheduledIso) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return { error: "Horário inválido." };
  if (!scheduledAt && !item.asNeeded) return { error: "Escolha o horário." };
  if (scheduledAt && scheduledAt.getTime() > Date.now() + 60 * 60_000) return { error: "Este horário ainda não chegou." };
  if (item.suspendedAt && (!scheduledAt || scheduledAt >= item.suspendedAt)) return { error: "Este item foi suspenso pelo médico." };
  if (scheduledAt && !isDoseTime(item, scheduledAt)) return { error: "Este não é um horário desta prescrição. Recarregue a página e cheque pelo horário da lista." };

  try {
    await prisma.medicationCheck.create({ data: { clinicId: user.clinicId, itemId: item.id, scheduledAt, status, note, recordedById: user.id } });
  } catch (e) {
    if (isDuplicate(e)) return { error: "Este horário acabou de ser checado por outra pessoa." };
    throw e;
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CHECAGEM_REGISTRADA", entity: "PrescriptionItem", entityId: item.id, patientId, details: { item: item.description, situacao: status === "FEITO" ? "feito" : "não feito" } });
  revalidatePath(path);
  return { error: "" };
}

// Checagem errada: fica riscada com o motivo. Só quem checou ou quem tem acesso completo.
export async function cancelCheck(ctx: RxContext, checkId: string, formData: FormData) {
  const { user, patientId, path } = await openContext(ctx);
  if (!canWorkClinical(user)) throw new Error("Sem permissão");
  const reason = text(formData, "reason");
  if (!reason) throw new Error("Informe o motivo da anulação.");
  const check = await prisma.medicationCheck.findFirst({ where: { id: checkId, clinicId: user.clinicId, canceledAt: null } });
  if (!check) return;
  if (check.recordedById !== user.id && !canViewClinical(user)) throw new Error("Só quem checou pode anular.");
  await prisma.medicationCheck.update({ where: { id: check.id }, data: { canceledAt: new Date(), canceledById: user.id, cancelReason: reason } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CHECAGEM_ANULADA", entity: "MedicationCheck", entityId: check.id, patientId, details: { motivo: reason } });
  revalidatePath(path);
}
