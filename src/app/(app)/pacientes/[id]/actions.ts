"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canAddAddendum, canEditEncounter, canViewClinical } from "@/lib/permissions";
import { documentTypes } from "@/lib/documents";
import { documentHash, encounterHash, parseDiagnoses, sanitizeContent, type TemplateField } from "@/lib/record";
import { parseVitals } from "@/lib/vitals";

const freeTextFields: TemplateField[] = [{ key: "evolucao", label: "Evolução", type: "textarea" }];

export async function startEncounter(patientId: string, formData: FormData) {
  const user = await requireUser("pacientes");
  if (!canViewClinical(user)) throw new Error("Sem permissão");

  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } });
  if (!patient) throw new Error("Paciente não encontrado");

  const templateId = String(formData.get("templateId") ?? "") || null;
  const template = templateId
    ? await prisma.recordTemplate.findFirst({ where: { id: templateId, clinicId: user.clinicId } })
    : null;

  const encounter = await prisma.encounter.create({
    data: {
      clinicId: user.clinicId,
      patientId,
      professionalId: user.id,
      templateId: template?.id,
      fields: (template?.fields as TemplateField[] | undefined) ?? freeTextFields,
    },
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "ATENDIMENTO_INICIADO",
    entity: "Encounter",
    entityId: encounter.id,
    patientId,
  });
  redirect(`/pacientes/${patientId}/atendimentos/${encounter.id}`);
}

async function loadEditable(encounterId: string) {
  const user = await requireUser("pacientes");
  const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, clinicId: user.clinicId } });
  if (!encounter) throw new Error("Atendimento não encontrado");
  if (!canEditEncounter(user, encounter)) throw new Error("Este atendimento não pode mais ser editado");
  return { user, encounter };
}

function readForm(fields: TemplateField[], formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const f of fields) raw[f.key] = formData.get(`field_${f.key}`);
  return {
    content: sanitizeContent(fields, raw),
    diagnoses: parseDiagnoses(String(formData.get("diagnoses") ?? "")),
    vitals: parseVitals(formData),
  };
}

// Salvamento automático do rascunho. Não recarrega a página, para não atrapalhar quem está digitando.
export async function autosaveEncounter(encounterId: string, formData: FormData) {
  const { user, encounter } = await loadEditable(encounterId);
  const { vitals, ...data } = readForm(encounter.fields as TemplateField[], formData);
  await prisma.encounter.update({ where: { id: encounter.id }, data: { ...data, vitals: vitals ?? Prisma.DbNull } });

  // Com o salvamento automático, registramos na auditoria no máximo um salvamento a cada 10 minutos.
  const recent = await prisma.auditLog.findFirst({
    where: {
      clinicId: user.clinicId,
      userId: user.id,
      action: "ATENDIMENTO_SALVO",
      entityId: encounter.id,
      createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
    },
  });
  if (!recent) {
    await audit({
      clinicId: user.clinicId,
      userId: user.id,
      action: "ATENDIMENTO_SALVO",
      entity: "Encounter",
      entityId: encounter.id,
      patientId: encounter.patientId,
    });
  }
  return new Date().toISOString();
}

export async function finalizeEncounter(encounterId: string, formData: FormData) {
  const { user, encounter } = await loadEditable(encounterId);
  const { vitals, ...data } = readForm(encounter.fields as TemplateField[], formData);
  const finalizedAt = new Date();
  const contentHash = encounterHash({ ...encounter, ...data, vitals, finalizedAt });

  await prisma.encounter.update({
    where: { id: encounter.id },
    data: { ...data, vitals: vitals ?? Prisma.DbNull, status: "FINALIZADO", finalizedAt, contentHash },
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "ATENDIMENTO_FINALIZADO",
    entity: "Encounter",
    entityId: encounter.id,
    patientId: encounter.patientId,
    details: { contentHash },
  });
  redirect(`/pacientes/${encounter.patientId}/atendimentos/${encounter.id}`);
}

export async function addAddendum(encounterId: string, formData: FormData) {
  const user = await requireUser("pacientes");
  const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, clinicId: user.clinicId } });
  if (!encounter || !canAddAddendum(user, encounter)) throw new Error("Sem permissão");

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  const addendum = await prisma.addendum.create({ data: { encounterId, authorId: user.id, text } });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "ADENDO_CRIADO",
    entity: "Addendum",
    entityId: addendum.id,
    patientId: encounter.patientId,
  });
  revalidatePath(`/pacientes/${encounter.patientId}/atendimentos/${encounter.id}`);
}

// Emite receita, atestado, pedido de exame ou relatório dentro do atendimento.
// Só o profissional do atendimento emite; depois de emitido não muda mais.
export async function issueDocument(encounterId: string, formData: FormData) {
  const user = await requireUser("pacientes");
  const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, clinicId: user.clinicId } });
  if (!encounter || !canViewClinical(user) || encounter.professionalId !== user.id) throw new Error("Sem permissão");

  const type = documentTypes.find((t) => t === formData.get("type"));
  const body = String(formData.get("body") ?? "").trim();
  if (!type || !body) return;

  const id = randomUUID();
  const createdAt = new Date();
  const contentHash = documentHash({ id, patientId: encounter.patientId, authorId: user.id, type, body, createdAt });
  await prisma.clinicalDocument.create({
    data: {
      id,
      clinicId: user.clinicId,
      encounterId,
      patientId: encounter.patientId,
      authorId: user.id,
      type,
      body,
      createdAt,
      contentHash,
    },
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "DOCUMENTO_EMITIDO",
    entity: "ClinicalDocument",
    entityId: id,
    patientId: encounter.patientId,
    details: { type, contentHash },
  });
  revalidatePath(`/pacientes/${encounter.patientId}/atendimentos/${encounter.id}`);
}
