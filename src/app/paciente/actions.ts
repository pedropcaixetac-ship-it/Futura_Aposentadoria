"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { onlyDigits } from "@/lib/format";
import {
  afterFailure,
  isLocked,
  LOCK_MINUTES,
  parseBirthDate,
  patientCancelReason,
  patientCanCancel,
  patientCanConfirm,
  sameDay,
} from "@/lib/patient-app";
import { syncAppointmentTeleconsultation } from "@/lib/teleconsulta-agenda";
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

// Consulta do paciente que está no aplicativo; qualquer outra dá erro.
async function ownAppointment(id: string) {
  const patient = await getCurrentPatient();
  if (!patient) redirect("/paciente/entrar");
  const appointment = await prisma.appointment.findFirst({ where: { id, clinicId: patient.clinicId, patientId: patient.id } });
  if (!appointment) throw new Error("Consulta não encontrada");
  return { patient, appointment };
}

export async function patientConfirm(id: string) {
  const { patient, appointment } = await ownAppointment(id);
  if (!patientCanConfirm(appointment)) throw new Error("Esta consulta não pode ser confirmada");
  await prisma.appointment.update({ where: { id }, data: { status: "CONFIRMADO", confirmedInAppAt: new Date() } });
  await audit({
    clinicId: patient.clinicId,
    action: "PACIENTE_APP_CONFIRMOU",
    entity: "Appointment",
    entityId: id,
    patientId: patient.id,
    details: { antes: appointment.status, depois: "CONFIRMADO" },
  });
  refreshAgenda();
}

export async function patientCancel(id: string, formData: FormData) {
  const { patient, appointment } = await ownAppointment(id);
  if (!patientCanCancel(appointment)) throw new Error("Esta consulta não pode ser desmarcada");
  const cancelReason = patientCancelReason(String(formData.get("reason") ?? ""));
  await prisma.appointment.update({ where: { id }, data: { status: "DESMARCADO", cancelReason, cancelledInAppAt: new Date() } });
  await audit({
    clinicId: patient.clinicId,
    action: "PACIENTE_APP_DESMARCOU",
    entity: "Appointment",
    entityId: id,
    patientId: patient.id,
    details: { motivo: cancelReason },
  });
  await syncAppointmentTeleconsultation(id, null);
  refreshAgenda();
}

function refreshAgenda() {
  revalidatePath("/paciente");
  revalidatePath("/recepcao");
  revalidatePath("/atender");
  revalidatePath("/agenda", "layout");
}
