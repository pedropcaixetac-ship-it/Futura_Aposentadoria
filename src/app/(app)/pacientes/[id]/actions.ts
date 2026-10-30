"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canAddAddendum, canEditEncounter, canViewClinical } from "@/lib/permissions";
import { LINK_HOURS, newTeleconsultationToken } from "@/lib/teleconsulta";
import { encounterHash, parseDiagnoses, sanitizeContent, type TemplateField } from "@/lib/record";

const freeTextFields: TemplateField[] = [{ key: "evolucao", label: "Evolução", type: "textarea" }];

async function createEncounter(patientId: string, formData: FormData) {
  const user = await requireUser();
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
  return { user, encounter };
}

export async function startEncounter(patientId: string, formData: FormData) {
  const { encounter } = await createEncounter(patientId, formData);
  redirect(`/pacientes/${patientId}/atendimentos/${encounter.id}`);
}

// Teleconsulta: um atendimento normal do prontuário com um link de vídeo para o paciente.
export async function startTeleconsultation(patientId: string, formData: FormData) {
  const { user, encounter } = await createEncounter(patientId, formData);
  const teleconsultation = await prisma.teleconsultation.create({
    data: {
      clinicId: user.clinicId,
      patientId,
      professionalId: user.id,
      encounterId: encounter.id,
      token: newTeleconsultationToken(),
      expiresAt: new Date(Date.now() + LINK_HOURS * 3600 * 1000),
    },
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "TELECONSULTA_CRIADA",
    entity: "Teleconsultation",
    entityId: teleconsultation.id,
    patientId,
  });
  redirect(`/pacientes/${patientId}/atendimentos/${encounter.id}`);
}

async function loadEditable(encounterId: string) {
  const user = await requireUser();
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
  };
}

export async function saveEncounter(encounterId: string, formData: FormData) {
  const { user, encounter } = await loadEditable(encounterId);
  const data = readForm(encounter.fields as TemplateField[], formData);
  await prisma.encounter.update({ where: { id: encounter.id }, data });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "ATENDIMENTO_SALVO",
    entity: "Encounter",
    entityId: encounter.id,
    patientId: encounter.patientId,
  });
  revalidatePath(`/pacientes/${encounter.patientId}/atendimentos/${encounter.id}`);
}

export async function finalizeEncounter(encounterId: string, formData: FormData) {
  const { user, encounter } = await loadEditable(encounterId);
  const data = readForm(encounter.fields as TemplateField[], formData);
  const finalizedAt = new Date();
  const contentHash = encounterHash({ ...encounter, ...data, finalizedAt });

  await prisma.encounter.update({
    where: { id: encounter.id },
    data: { ...data, status: "FINALIZADO", finalizedAt, contentHash },
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
  const user = await requireUser();
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
