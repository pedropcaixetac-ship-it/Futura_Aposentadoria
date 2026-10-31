"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { FormState } from "../financeiro/actions";

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function registerVisit(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("visitas");
  const admission = await prisma.admission.findFirst({
    where: { id: text(formData, "admissionId") ?? "", clinicId: user.clinicId, dischargedAt: null },
    include: { patient: { select: { name: true } }, bed: { select: { code: true } } },
  });
  if (!admission) return { error: "Escolha o paciente internado que vai receber a visita." };
  const visitorName = text(formData, "visitorName");
  if (!visitorName || visitorName.length < 3) return { error: "Informe o nome completo do visitante." };

  const visit = await prisma.visit.create({
    data: {
      clinicId: user.clinicId,
      admissionId: admission.id,
      visitorName,
      visitorDocument: text(formData, "visitorDocument"),
      relationship: text(formData, "relationship"),
      registeredById: user.id,
    },
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "VISITA_ENTRADA",
    entity: "Visit",
    entityId: visit.id,
    patientId: admission.patientId,
    details: { visitante: visitorName, leito: admission.bed.code },
  });
  revalidatePath("/visitas");
  return { error: "", ok: `Entrada de ${visitorName} registrada (visita a ${admission.patient.name}, leito ${admission.bed.code}).` };
}

export async function registerVisitExit(visitId: string) {
  const user = await requireUser("visitas");
  const visit = await prisma.visit.findFirst({ where: { id: visitId, clinicId: user.clinicId, leftAt: null }, include: { admission: { select: { patientId: true } } } });
  if (!visit) return;
  await prisma.visit.update({ where: { id: visit.id }, data: { leftAt: new Date() } });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "VISITA_SAIDA",
    entity: "Visit",
    entityId: visit.id,
    patientId: visit.admission.patientId,
    details: { visitante: visit.visitorName },
  });
  revalidatePath("/visitas");
}
