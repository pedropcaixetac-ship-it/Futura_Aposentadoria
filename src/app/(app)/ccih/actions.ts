"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type InfectionSite, type IsolationKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canWorkInfectionControl } from "@/lib/hospital-roles";

const onlyCcih = "Só médicos e enfermeiros registram na CCIH.";
import { audit } from "@/lib/audit";
import { DEVICES, isolationLabel, siteLabel } from "@/lib/ccih";

export type FormState = { error: string; ok?: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function startIsolation(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("ccih");
  if (!canWorkInfectionControl(user)) return { error: onlyCcih };
  const kind = text(formData, "kind") as IsolationKind | null;
  if (!kind || !(kind in isolationLabel)) return { error: "Escolha o tipo de isolamento." };
  const reason = text(formData, "reason");
  if (!reason) return { error: "Informe o germe ou o motivo." };
  const admission = await prisma.admission.findFirst({ where: { id: text(formData, "admissionId") ?? "", clinicId: user.clinicId, dischargedAt: null } });
  if (!admission) return { error: "Escolha o paciente internado." };
  try {
    const record = await prisma.isolationPrecaution.create({ data: { clinicId: user.clinicId, admissionId: admission.id, kind, reason, startedById: user.id } });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "ISOLAMENTO_INICIADO", entity: "IsolationPrecaution", entityId: record.id, patientId: admission.patientId, details: { tipo: isolationLabel[kind], motivo: reason } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: `O paciente já está em isolamento de ${isolationLabel[kind].toLowerCase()}.` };
    throw e;
  }
  revalidatePath("/ccih");
  return { error: "", ok: "Isolamento registrado. Ele aparece no mapa de leitos e na cozinha." };
}

export async function endIsolation(isolationId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("ccih");
  if (!canWorkInfectionControl(user)) return { error: onlyCcih };
  const endReason = text(formData, "endReason");
  if (!endReason) return { error: "Informe por que o isolamento acabou." };
  const record = await prisma.isolationPrecaution.findFirst({ where: { id: isolationId, clinicId: user.clinicId, endedAt: null }, include: { admission: { select: { patientId: true } } } });
  if (!record) return { error: "Isolamento já encerrado." };
  await prisma.isolationPrecaution.update({ where: { id: record.id }, data: { endedAt: new Date(), endedById: user.id, endReason } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ISOLAMENTO_ENCERRADO", entity: "IsolationPrecaution", entityId: record.id, patientId: record.admission.patientId, details: { motivo: endReason } });
  revalidatePath("/ccih");
  return { error: "", ok: "Encerrado." };
}

export async function reportInfection(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("ccih");
  if (!canWorkInfectionControl(user)) return { error: onlyCcih };
  const site = text(formData, "site") as InfectionSite | null;
  if (!site || !(site in siteLabel)) return { error: "Escolha o tipo de infecção." };
  const dateRaw = text(formData, "diagnosedAt");
  const diagnosedAt = dateRaw ? new Date(`${dateRaw}T00:00:00Z`) : null;
  if (!diagnosedAt || Number.isNaN(diagnosedAt.getTime())) return { error: "Informe a data do diagnóstico." };
  if (diagnosedAt.getTime() > Date.now()) return { error: "A data do diagnóstico não pode ser no futuro." };
  const device = text(formData, "device");
  if (device && !DEVICES.includes(device)) return { error: "Escolha o dispositivo." };
  const admission = await prisma.admission.findFirst({ where: { id: text(formData, "admissionId") ?? "", clinicId: user.clinicId } });
  if (!admission) return { error: "Escolha o paciente." };
  if (diagnosedAt.getTime() < new Date(admission.admittedAt.toISOString().slice(0, 10)).getTime()) return { error: "A data é anterior à internação." };
  const record = await prisma.hospitalInfection.create({
    data: { clinicId: user.clinicId, admissionId: admission.id, site, diagnosedAt, organism: text(formData, "organism"), device: device === "Nenhum" ? null : device, note: text(formData, "note"), reportedById: user.id },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "INFECCAO_NOTIFICADA", entity: "HospitalInfection", entityId: record.id, patientId: admission.patientId, details: { tipo: siteLabel[site] } });
  revalidatePath("/ccih");
  return { error: "", ok: "Infecção notificada." };
}

export async function cancelInfection(infectionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("ccih");
  if (!canWorkInfectionControl(user)) return { error: onlyCcih };
  const reason = text(formData, "reason");
  if (!reason) return { error: "Informe o motivo da anulação." };
  const record = await prisma.hospitalInfection.findFirst({ where: { id: infectionId, clinicId: user.clinicId, canceledAt: null }, include: { admission: { select: { patientId: true } } } });
  if (!record) return { error: "Já anulada." };
  await prisma.hospitalInfection.update({ where: { id: record.id }, data: { canceledAt: new Date(), canceledById: user.id, cancelReason: reason } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "INFECCAO_ANULADA", entity: "HospitalInfection", entityId: record.id, patientId: record.admission.patientId, details: { motivo: reason } });
  revalidatePath("/ccih");
  return { error: "", ok: "Anulada." };
}
