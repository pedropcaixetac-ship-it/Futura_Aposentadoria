"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parsePatient, readFormData, sameNameKey, validatePatient, type PatientInput, type RegistrationMode } from "@/lib/patient";
import { canViewClinical } from "@/lib/permissions";

export type FormState = { error: string; duplicate?: { id: string; name: string } };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function modeOf(formData: FormData): RegistrationMode {
  return formData.get("mode") === "rapido" ? "rapido" : "completo";
}

function friendlyError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    const target = String(e.meta?.target ?? "");
    return target.includes("cns")
      ? "Já existe um paciente com este Cartão SUS nesta clínica."
      : "Já existe um paciente com este CPF nesta clínica.";
  }
  throw e;
}

async function findDuplicate(clinicId: string, data: PatientInput, exceptId?: string) {
  if (!data.birthDate) return null;
  const sameBirth = await prisma.patient.findMany({
    where: { clinicId, birthDate: data.birthDate, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true, name: true },
  });
  return sameBirth.find((p) => sameNameKey(p.name) === sameNameKey(data.name)) ?? null;
}

// Guarda a data do primeiro consentimento LGPD; desmarcar apaga.
// Convênio escolhido na lista dos cadastrados: confere se é desta clínica e usa o nome cadastrado.
async function applyHealthPlan(clinicId: string, data: PatientInput): Promise<string> {
  if (!("healthPlanId" in data) || !data.healthPlanId) return "";
  const plan = await prisma.healthPlan.findFirst({ where: { id: data.healthPlanId, clinicId }, select: { name: true } });
  if (!plan) return "Convênio não encontrado. Escolha outro na lista.";
  data.insurance = plan.name;
  return "";
}

function consent(formData: FormData, before: Date | null | undefined) {
  if (modeOf(formData) === "rapido") return {};
  return { lgpdConsentAt: formData.get("lgpdConsent") ? (before ?? new Date()) : null };
}

// Mesma ideia para a autorização de mensagens pelo WhatsApp.
function whatsappConsent(formData: FormData, before: { whatsappOptIn: boolean; whatsappOptInAt: Date | null } | null) {
  if (modeOf(formData) === "rapido") return {};
  const optIn = formData.get("whatsappOptIn") !== null;
  return { whatsappOptIn: optIn, whatsappOptInAt: optIn ? (before?.whatsappOptInAt ?? new Date()) : null };
}

export async function createPatient(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("pacientes");
  const mode = modeOf(formData);
  const data = parsePatient(readFormData(formData), mode);
  const error = (await applyHealthPlan(user.clinicId, data)) || validatePatient(data, mode);
  if (error) return { error };

  if (!formData.get("confirmDuplicate")) {
    const duplicate = await findDuplicate(user.clinicId, data);
    if (duplicate) {
      return { error: "Já existe um paciente com o mesmo nome e data de nascimento.", duplicate };
    }
  }

  let id: string;
  try {
    const patient = await prisma.patient.create({ data: { ...data, ...consent(formData, null), ...whatsappConsent(formData, null), clinicId: user.clinicId } });
    id = patient.id;
  } catch (e) {
    return { error: friendlyError(e) };
  }
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "PACIENTE_CRIADO",
    entity: "Patient",
    entityId: id,
    patientId: id,
    details: { cadastro: mode },
  });
  if (whatsappConsent(formData, null).whatsappOptIn) {
    await audit({ clinicId: user.clinicId, userId: user.id, action: "WHATSAPP_AUTORIZADO", entity: "Patient", entityId: id, patientId: id });
  }
  redirect(`/pacientes/${id}`);
}

export async function updatePatient(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("pacientes");
  const data = parsePatient(readFormData(formData), "completo");
  const error = (await applyHealthPlan(user.clinicId, data)) || validatePatient(data, "completo");
  if (error) return { error };

  const before = await prisma.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!before) return { error: "Paciente não encontrado." };

  if (!formData.get("confirmDuplicate")) {
    const duplicate = await findDuplicate(user.clinicId, data, id);
    if (duplicate) {
      return { error: "Já existe outro paciente com o mesmo nome e data de nascimento.", duplicate };
    }
  }

  const whatsapp = whatsappConsent(formData, before);
  try {
    await prisma.patient.update({ where: { id }, data: { ...data, ...consent(formData, before.lgpdConsentAt), ...whatsapp } });
  } catch (e) {
    return { error: friendlyError(e) };
  }
  // Registra quais campos mudaram (sem os valores, para não espalhar dados pessoais na auditoria).
  const changed = Object.keys(data).filter((key) => {
    const a = before[key as keyof typeof before];
    const b = data[key as keyof typeof data];
    return String(a instanceof Date ? a.toISOString() : (a ?? "")) !== String(b instanceof Date ? b.toISOString() : (b ?? ""));
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "PACIENTE_ALTERADO",
    entity: "Patient",
    entityId: id,
    patientId: id,
    details: { camposAlterados: changed },
  });
  if (whatsapp.whatsappOptIn !== undefined && whatsapp.whatsappOptIn !== before.whatsappOptIn) {
    await audit({
      clinicId: user.clinicId,
      userId: user.id,
      action: whatsapp.whatsappOptIn ? "WHATSAPP_AUTORIZADO" : "WHATSAPP_REVOGADO",
      entity: "Patient",
      entityId: id,
      patientId: id,
    });
  }
  redirect(`/pacientes/${id}`);
}

export async function updateClinicalSummary(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("pacientes");
  if (!canViewClinical(user)) return { error: "Sem permissão." };

  const before = await prisma.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!before) return { error: "Paciente não encontrado." };

  const data = {
    allergies: text(formData, "allergies"),
    currentMedications: text(formData, "currentMedications"),
    personalHistory: text(formData, "personalHistory"),
    familyHistory: text(formData, "familyHistory"),
  };
  await prisma.patient.update({ where: { id }, data });
  // Guardamos o valor anterior na auditoria, já que esses campos podem ser editados.
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "RESUMO_CLINICO_ALTERADO",
    entity: "Patient",
    entityId: id,
    patientId: id,
    details: {
      antes: {
        allergies: before.allergies,
        currentMedications: before.currentMedications,
        personalHistory: before.personalHistory,
        familyHistory: before.familyHistory,
      },
      depois: data,
    },
  });
  // "layout" atualiza também a tela da consulta, onde o resumo pode ser editado.
  revalidatePath(`/pacientes/${id}`, "layout");
  return { error: "" };
}
