"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { Prisma, type DocumentType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasTab } from "@/lib/tabs";
import { audit } from "@/lib/audit";
import { canAddAddendum, canEditEncounter, canViewClinical, canWorkClinical } from "@/lib/permissions";
import { createEncounter } from "@/lib/encounter";
import { documentTypes } from "@/lib/documents";
import { isLaudo, LAUDO_TYPES, laudoText, parseLaudo, type LaudoValues } from "@/lib/laudos";
import { documentHash, encounterHash, parseDiagnoses, sanitizeContent, type TemplateField } from "@/lib/record";
import { parseVitals } from "@/lib/vitals";
import { LINK_HOURS, newTeleconsultationToken } from "@/lib/teleconsulta";

export async function startEncounter(patientId: string, formData: FormData) {
  const user = await requireUser("pacientes");
  if (!canWorkClinical(user)) throw new Error("Sem permissão");

  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } });
  if (!patient) throw new Error("Paciente não encontrado");

  const encounter = await createEncounter(user, patientId, String(formData.get("templateId") ?? "") || null);
  redirect(`/pacientes/${patientId}/atendimentos/${encounter.id}`);
}

// Teleconsulta: um atendimento normal do prontuário com um link de vídeo para o paciente.
export async function startTeleconsultation(patientId: string, formData: FormData) {
  const user = await requireUser("pacientes");
  if (!canViewClinical(user)) throw new Error("Sem permissão");

  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } });
  if (!patient) throw new Error("Paciente não encontrado");

  const encounter = await createEncounter(user, patientId, String(formData.get("templateId") ?? "") || null);
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
  // Só grava enquanto for rascunho: um salvamento atrasado que chega depois da finalização é ignorado.
  const { count } = await prisma.encounter.updateMany({ where: { id: encounter.id, clinicId: user.clinicId, status: "RASCUNHO" }, data: { ...data, vitals: vitals ?? Prisma.DbNull } });
  if (count === 0) throw new Error("Este atendimento não pode mais ser editado");

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

// Finaliza a partir da tela de revisão, com o que já está salvo no rascunho.
export async function finalizeEncounter(encounterId: string) {
  const { user, encounter: loaded } = await loadEditable(encounterId);
  // O código de integridade vale para o texto exato que fica guardado. A linha do atendimento fica travada enquanto
  // finaliza: um salvamento automático que chegue nesse instante espera e depois não grava mais nada.
  const { encounter, contentHash } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Encounter" WHERE id = ${loaded.id} FOR UPDATE`;
    const encounter = await tx.encounter.findFirst({ where: { id: loaded.id, clinicId: user.clinicId, status: "RASCUNHO" } });
    if (!encounter) throw new Error("Este atendimento não pode mais ser editado");
    const finalizedAt = new Date();
    const contentHash = encounterHash({ ...encounter, finalizedAt });
    await tx.encounter.update({ where: { id: encounter.id }, data: { status: "FINALIZADO", finalizedAt, contentHash } });
    return { encounter, contentHash };
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
  // Se o atendimento veio da agenda, a consulta passa para "Atendido".
  const { count } = await prisma.appointment.updateMany({ where: { encounterId: encounter.id }, data: { status: "ATENDIDO" } });
  // Evolução de paciente internado: volta para a internação.
  if (encounter.admissionId && hasTab(user, "internacao")) redirect(`/internacao/${encounter.admissionId}`);
  // Veio da aba Atender: volta para ela, para o profissional chamar o próximo paciente.
  if (count > 0 && hasTab(user, "atender")) redirect(`/atender?finalizado=${encounter.id}`);
  redirect(`/pacientes/${encounter.patientId}/atendimentos/${encounter.id}?finalizado=1`);
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

// Lê o documento do formulário: texto livre (receita, atestado...) ou campos do laudo do SUS.
function readDocument(formData: FormData, allowed: readonly DocumentType[]) {
  const type = allowed.find((t) => t === formData.get("type"));
  if (!type) return { error: "Escolha o tipo de documento." };
  if (isLaudo(type)) {
    const { values, missing } = parseLaudo(type, formData);
    if (missing.length) return { error: `Preencha: ${missing.join(", ")}.` };
    return { doc: { type, body: laudoText(type, values), fields: values } };
  }
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Escreva o texto do documento." };
  return { doc: { type, body, fields: null } };
}

async function saveDocument(
  user: { id: string; clinicId: string },
  patientId: string,
  encounterId: string | null,
  doc: { type: DocumentType; body: string; fields: LaudoValues | null },
) {
  const id = randomUUID();
  const createdAt = new Date();
  const contentHash = documentHash({ id, patientId, authorId: user.id, createdAt, ...doc });
  await prisma.clinicalDocument.create({
    data: {
      id,
      clinicId: user.clinicId,
      encounterId,
      patientId,
      authorId: user.id,
      type: doc.type,
      body: doc.body,
      fields: doc.fields ?? Prisma.DbNull,
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
    patientId,
    details: { type: doc.type, contentHash, ...(!encounterId && { semAtendimento: true }) },
  });
}

// Emite receita, atestado, pedido de exame, relatório ou laudo do SUS dentro do atendimento.
// Só o profissional do atendimento emite; depois de emitido não muda mais.
export async function issueDocument(encounterId: string, formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser("pacientes");
  const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, clinicId: user.clinicId } });
  if (!encounter || !canViewClinical(user) || encounter.professionalId !== user.id) throw new Error("Sem permissão");

  const { doc, error } = readDocument(formData, documentTypes);
  if (!doc) return { error };
  await saveDocument(user, encounter.patientId, encounter.id, doc);
  revalidatePath(`/pacientes/${encounter.patientId}/atendimentos/${encounter.id}`);
  return {};
}

// Laudo do SUS (APAC, AIH, LME) emitido direto pela ficha do paciente, sem abrir atendimento.
export async function issueLaudo(patientId: string, formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser("pacientes");
  if (!canViewClinical(user)) throw new Error("Sem permissão");
  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } });
  if (!patient) throw new Error("Paciente não encontrado");

  const { doc, error } = readDocument(formData, LAUDO_TYPES);
  if (!doc) return { error };
  await saveDocument(user, patientId, null, doc);
  revalidatePath(`/pacientes/${patientId}`);
  redirect(`/pacientes/${patientId}#laudos`);
}
