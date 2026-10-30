"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isValidCpf } from "@/lib/format";
import { canViewClinical } from "@/lib/permissions";

export type FormState = { error: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function patientData(formData: FormData) {
  const cpf = text(formData, "cpf")?.replace(/\D/g, "") || null;
  const birth = text(formData, "birthDate");
  return {
    name: text(formData, "name") ?? "",
    socialName: text(formData, "socialName"),
    birthDate: birth ? new Date(`${birth}T00:00:00Z`) : null,
    sex: text(formData, "sex"),
    cpf,
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    address: text(formData, "address"),
    insurance: text(formData, "insurance"),
    insuranceNumber: text(formData, "insuranceNumber"),
    guardianName: text(formData, "guardianName"),
  };
}

function validate(data: ReturnType<typeof patientData>) {
  if (data.name.length < 3) return "Informe o nome completo do paciente.";
  if (data.cpf && !isValidCpf(data.cpf)) return "CPF inválido.";
  if (data.birthDate && data.birthDate > new Date()) return "Data de nascimento no futuro.";
  return "";
}

function friendlyError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return "Já existe um paciente com este CPF nesta clínica.";
  }
  throw e;
}

export async function createPatient(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const data = patientData(formData);
  const error = validate(data);
  if (error) return { error };

  let id: string;
  try {
    const patient = await prisma.patient.create({ data: { ...data, clinicId: user.clinicId } });
    id = patient.id;
  } catch (e) {
    return { error: friendlyError(e) };
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PACIENTE_CRIADO", entity: "Patient", entityId: id, patientId: id });
  redirect(`/pacientes/${id}`);
}

export async function updatePatient(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const data = patientData(formData);
  const error = validate(data);
  if (error) return { error };

  try {
    const { count } = await prisma.patient.updateMany({ where: { id, clinicId: user.clinicId }, data });
    if (count === 0) return { error: "Paciente não encontrado." };
  } catch (e) {
    return { error: friendlyError(e) };
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PACIENTE_ALTERADO", entity: "Patient", entityId: id, patientId: id });
  redirect(`/pacientes/${id}`);
}

export async function updateClinicalSummary(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
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
  revalidatePath(`/pacientes/${id}`);
  return { error: "" };
}
