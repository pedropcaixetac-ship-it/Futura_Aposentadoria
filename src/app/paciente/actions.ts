"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { onlyDigits } from "@/lib/format";
import { afterFailure, isLocked, LOCK_MINUTES, parseBirthDate, sameDay } from "@/lib/patient-app";
import { createPatientSession, destroyPatientSession, getCurrentPatient } from "@/lib/patient-auth";

const WRONG = "Clínica, CPF ou data de nascimento não conferem. Se o erro continuar, fale com a recepção.";

export async function patientLogin(_: { error: string }, formData: FormData) {
  const slug = String(formData.get("clinic") ?? "").trim().toLowerCase();
  const cpf = onlyDigits(String(formData.get("cpf") ?? ""));
  const birth = parseBirthDate(String(formData.get("birthDate") ?? ""));

  const clinic = slug ? await prisma.clinic.findUnique({ where: { slug } }) : null;
  const patient = clinic && cpf.length === 11 ? await prisma.patient.findUnique({ where: { clinicId_cpf: { clinicId: clinic.id, cpf } } }) : null;
  if (!clinic || !patient) return { error: WRONG };

  const base = { clinicId: clinic.id, entity: "Patient", entityId: patient.id, patientId: patient.id };
  if (isLocked(patient)) {
    await audit({ ...base, action: "PACIENTE_APP_BLOQUEADO" });
    return { error: `Muitas tentativas erradas. Por segurança, tente de novo daqui a ${LOCK_MINUTES} minutos.` };
  }

  if (!birth || !patient.birthDate || !sameDay(birth, patient.birthDate)) {
    const next = afterFailure(patient);
    await prisma.patient.update({ where: { id: patient.id }, data: next });
    await audit({ ...base, action: next.appLockedUntil ? "PACIENTE_APP_BLOQUEADO" : "PACIENTE_APP_FALHOU" });
    return { error: WRONG };
  }

  await prisma.patient.update({ where: { id: patient.id }, data: { appLoginFailures: 0, appLockedUntil: null } });
  // Clínica suspensa no Painel do dono: o aplicativo do paciente também fica fechado.
  if (!clinic.active) return { error: "O aplicativo desta clínica está fora do ar no momento. Fale com a recepção." };
  await createPatientSession(patient.id);
  await audit({ ...base, action: "PACIENTE_APP_ENTROU" });
  redirect("/paciente");
}

export async function patientLogout() {
  const patient = await getCurrentPatient();
  if (patient) await audit({ clinicId: patient.clinicId, entity: "Patient", entityId: patient.id, patientId: patient.id, action: "PACIENTE_APP_SAIU" });
  await destroyPatientSession();
  redirect("/paciente/entrar");
}
