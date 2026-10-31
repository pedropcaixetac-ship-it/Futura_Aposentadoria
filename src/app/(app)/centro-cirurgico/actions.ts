"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type AnesthesiaKind, type ChecklistPhase } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { withLock } from "@/lib/lock";
import { canWorkClinical } from "@/lib/permissions";
import { isPhysician } from "@/lib/pronto-socorro";
import { anesthesiaLabel, CHECKLIST, LATERALITIES, missingChecklist, nextStep, overlaps, PHASES, STEPS, type StepKey } from "@/lib/centro-cirurgico";

export type FormState = { error: string; ok?: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

const path = (id: string) => `/centro-cirurgico/${id}`;

export async function saveRoom(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("centro-cirurgico");
  if (user.role !== "ADMIN" && user.role !== "ADMINISTRATIVO") return { error: "Só a administração cadastra salas." };
  const name = text(formData, "name");
  if (!name) return { error: "Informe o nome da sala." };
  try {
    await prisma.operatingRoom.create({ data: { clinicId: user.clinicId, name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Já existe uma sala com esse nome." };
    throw e;
  }
  revalidatePath("/centro-cirurgico");
  return { error: "", ok: `${name} cadastrada.` };
}

// Agenda a cirurgia. A sala e o cirurgião não podem ter outra cirurgia no mesmo horário.
export async function scheduleSurgery(patientId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("centro-cirurgico");
  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } });
  if (!patient) return { error: "Paciente não encontrado." };
  const room = await prisma.operatingRoom.findFirst({ where: { id: text(formData, "roomId") ?? "", clinicId: user.clinicId, active: true } });
  if (!room) return { error: "Escolha a sala." };
  const surgeon = await prisma.user.findFirst({ where: { id: text(formData, "surgeonId") ?? "", clinicId: user.clinicId, active: true } });
  if (!surgeon || !isPhysician(surgeon)) return { error: "Escolha o cirurgião (médico com CRM)." };
  const anesthetistId = text(formData, "anesthetistId");
  const anesthetist = anesthetistId ? await prisma.user.findFirst({ where: { id: anesthetistId, clinicId: user.clinicId, active: true } }) : null;
  if (anesthetistId && (!anesthetist || !isPhysician(anesthetist))) return { error: "O anestesista precisa ser médico com CRM." };
  if (anesthetist && anesthetist.id === surgeon.id) return { error: "O anestesista não pode ser o próprio cirurgião." };
  const procedure = text(formData, "procedure");
  if (!procedure) return { error: "Informe a cirurgia." };
  const laterality = text(formData, "laterality");
  if (laterality && !LATERALITIES.includes(laterality)) return { error: "Escolha o lado." };
  const anesthesia = text(formData, "anesthesia") as AnesthesiaKind | null;
  if (anesthesia && !(anesthesia in anesthesiaLabel)) return { error: "Escolha a anestesia." };
  const whenRaw = text(formData, "scheduledAt");
  const scheduledAt = whenRaw ? new Date(`${whenRaw}:00-03:00`) : null;
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return { error: "Informe o dia e a hora." };
  if (scheduledAt.getTime() < Date.now() - 60 * 60_000) return { error: "O horário já passou." };
  const expectedMinutes = Number(text(formData, "expectedMinutes"));
  if (!Number.isInteger(expectedMinutes) || expectedMinutes < 10 || expectedMinutes > 1440) return { error: "Informe a duração prevista em minutos." };
  const admission = await prisma.admission.findFirst({ where: { clinicId: user.clinicId, patientId: patient.id, dischargedAt: null }, select: { id: true } });

  const dayStart = new Date(scheduledAt.getTime() - 24 * 3600_000);
  const dayEnd = new Date(scheduledAt.getTime() + 24 * 3600_000);
  // Sala, cirurgião, anestesista e paciente: nenhum deles pode estar em duas cirurgias ao mesmo tempo.
  // Médico vale igual como cirurgião ou anestesista (não pode operar numa sala e anestesiar em outra).
  const doctors = [surgeon.id, ...(anesthetist ? [anesthetist.id] : [])];
  const keys = [`sala:${room.id}`, `paciente-cc:${patient.id}`, ...doctors.map((d) => `cirurgiao:${d}`)];
  const result = await withLock(keys, async (tx) => {
    const nearby = await tx.surgery.findMany({
      where: {
        clinicId: user.clinicId, canceledAt: null, status: { not: "REALIZADA" }, scheduledAt: { gte: dayStart, lte: dayEnd },
        OR: [{ roomId: room.id }, { patientId: patient.id }, { surgeonId: { in: doctors } }, { anesthetistId: { in: doctors } }],
      },
      select: { roomId: true, surgeonId: true, anesthetistId: true, patientId: true, scheduledAt: true, expectedMinutes: true, procedure: true },
    });
    const clash = nearby.find((s) => overlaps(s.scheduledAt, s.expectedMinutes, scheduledAt, expectedMinutes));
    if (clash) {
      if (clash.roomId === room.id) return { error: `A ${room.name} já está ocupada nesse horário (${clash.procedure}).` };
      if (clash.patientId === patient.id) return { error: `O paciente já tem outra cirurgia nesse horário (${clash.procedure}).` };
      const surgeonBusy = clash.surgeonId === surgeon.id || clash.anesthetistId === surgeon.id;
      return { error: surgeonBusy ? "O cirurgião já está em outra cirurgia nesse horário." : "O anestesista já está em outra cirurgia nesse horário." };
    }
    const surgery = await tx.surgery.create({
      data: {
        clinicId: user.clinicId, patientId: patient.id, admissionId: admission?.id ?? null, roomId: room.id, surgeonId: surgeon.id, anesthetistId: anesthetist?.id ?? null,
        procedure, laterality, anesthesia, scheduledAt, expectedMinutes, note: text(formData, "note"), createdById: user.id,
      },
    });
    return { id: surgery.id, error: undefined };
  });
  if (result.error !== undefined) return { error: result.error };
  const id = result.id!;
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CIRURGIA_AGENDADA", entity: "Surgery", entityId: id, patientId: patient.id, details: { cirurgia: procedure, sala: room.name } });
  redirect(path(id));
}

export async function cancelSurgery(surgeryId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("centro-cirurgico");
  const reason = text(formData, "reason");
  if (!reason) return { error: "Informe o motivo da suspensão." };
  const surgery = await prisma.surgery.findFirst({ where: { id: surgeryId, clinicId: user.clinicId } });
  if (!surgery) return { error: "Cirurgia não encontrada." };
  const { count } = await prisma.surgery.updateMany({
    where: { id: surgery.id, clinicId: user.clinicId, status: "AGENDADA" },
    data: { status: "CANCELADA", canceledAt: new Date(), canceledById: user.id, cancelReason: reason },
  });
  if (!count) return { error: "Só cirurgia ainda não iniciada pode ser suspensa." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CIRURGIA_CANCELADA", entity: "Surgery", entityId: surgery.id, patientId: surgery.patientId, details: { motivo: reason } });
  revalidatePath(path(surgery.id));
  revalidatePath("/centro-cirurgico");
  return { error: "", ok: "Cirurgia suspensa." };
}

// Registra o próximo tempo da cirurgia, na ordem, exigindo a etapa da cirurgia segura que vem antes.
export async function recordStep(surgeryId: string, step: StepKey): Promise<FormState> {
  const user = await requireUser("centro-cirurgico");
  if (!canWorkClinical(user)) return { error: "Só a equipe de saúde registra os tempos." };
  const surgery = await prisma.surgery.findFirst({ where: { id: surgeryId, clinicId: user.clinicId }, include: { checklists: { select: { phase: true } } } });
  if (!surgery || surgery.canceledAt || surgery.status === "REALIZADA") return { error: "Cirurgia não está em andamento." };
  const hasAnesthesia = !!surgery.anesthesia && surgery.anesthesia !== "LOCAL";
  const expected = nextStep(surgery, hasAnesthesia);
  if (!expected || expected.key !== step) return { error: "Registre os tempos na ordem." };
  const missing = missingChecklist(expected, surgery.checklists.map((c) => c.phase), hasAnesthesia);
  if (missing) return { error: `Faça antes a etapa "${CHECKLIST[missing].label}" da cirurgia segura.` };

  const now = new Date();
  const error = await withLock([`sala:${surgery.roomId}`], async (tx) => {
    if (step === "patientInAt") {
      const busy = await tx.surgery.findFirst({ where: { clinicId: user.clinicId, roomId: surgery.roomId, status: "EM_SALA", NOT: { id: surgery.id } }, select: { procedure: true } });
      if (busy) return `A sala ainda está ocupada (${busy.procedure}). Registre a saída do paciente anterior.`;
    }
    const { count } = await tx.surgery.updateMany({
      where: { id: surgery.id, clinicId: user.clinicId, [step]: null },
      data: { [step]: now, ...(step === "patientInAt" ? { status: "EM_SALA" as const } : {}), ...(step === "patientOutAt" ? { status: "REALIZADA" as const } : {}) },
    });
    return count ? null : "Esse tempo já foi registrado.";
  });
  if (error) return { error };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CIRURGIA_TEMPO", entity: "Surgery", entityId: surgery.id, patientId: surgery.patientId, details: { tempo: STEPS.find((s) => s.key === step)!.label } });
  revalidatePath(path(surgery.id));
  revalidatePath("/centro-cirurgico");
  return { error: "", ok: "Registrado." };
}

// Etapa da cirurgia segura: todos os itens precisam ser conferidos.
export async function saveChecklist(surgeryId: string, phase: ChecklistPhase, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("centro-cirurgico");
  if (!canWorkClinical(user)) return { error: "Só a equipe de saúde faz a cirurgia segura." };
  if (!PHASES.includes(phase)) return { error: "Etapa inválida." };
  const surgery = await prisma.surgery.findFirst({ where: { id: surgeryId, clinicId: user.clinicId }, include: { checklists: { select: { phase: true } } } });
  if (!surgery || surgery.status !== "EM_SALA") return { error: "O paciente precisa estar na sala." };
  const previous = PHASES[PHASES.indexOf(phase) - 1];
  if (previous && !surgery.checklists.some((c) => c.phase === previous)) return { error: `Faça antes a etapa "${CHECKLIST[previous].label}".` };
  const items = CHECKLIST[phase].items;
  const missing = items.filter((_, i) => formData.get(`item${i}`) !== "on");
  if (missing.length) return { error: `Falta conferir: ${missing[0]}${missing.length > 1 ? ` (e mais ${missing.length - 1})` : ""}.` };
  try {
    const record = await prisma.surgeryChecklist.create({
      data: { clinicId: user.clinicId, surgeryId: surgery.id, phase, answers: items.map((item) => ({ item, ok: true })), note: text(formData, "note"), doneById: user.id },
    });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "CIRURGIA_CHECKLIST", entity: "SurgeryChecklist", entityId: record.id, patientId: surgery.patientId, details: { etapa: CHECKLIST[phase].label } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Esta etapa já foi feita." };
    throw e;
  }
  revalidatePath(path(surgery.id));
  return { error: "", ok: "Etapa registrada." };
}

// Descrição cirúrgica: só o cirurgião, uma vez, depois do fim da cirurgia.
export async function saveOperativeNote(surgeryId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("centro-cirurgico");
  const note = text(formData, "operativeNote");
  if (!note) return { error: "Escreva a descrição." };
  const surgery = await prisma.surgery.findFirst({ where: { id: surgeryId, clinicId: user.clinicId } });
  if (!surgery) return { error: "Cirurgia não encontrada." };
  if (surgery.surgeonId !== user.id) return { error: "Só o cirurgião escreve a descrição cirúrgica." };
  if (!surgery.endAt) return { error: "Registre antes o fim da cirurgia." };
  const { count } = await prisma.surgery.updateMany({ where: { id: surgery.id, clinicId: user.clinicId, operativeNote: null }, data: { operativeNote: note } });
  if (!count) return { error: "A descrição já foi feita." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CIRURGIA_DESCRICAO", entity: "Surgery", entityId: surgery.id, patientId: surgery.patientId });
  revalidatePath(path(surgery.id));
  return { error: "", ok: "Descrição salva." };
}

// Material da CME usado na cirurgia: só pacote de carga liberada e dentro da validade.
export async function usePackage(surgeryId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("centro-cirurgico");
  if (!canWorkClinical(user)) return { error: "Só a equipe de saúde registra o material." };
  const surgery = await prisma.surgery.findFirst({ where: { id: surgeryId, clinicId: user.clinicId, status: { in: ["AGENDADA", "EM_SALA"] } } });
  if (!surgery) return { error: "A cirurgia não está em andamento." };
  const packageId = text(formData, "packageId");
  if (!packageId) return { error: "Escolha o pacote." };
  const now = new Date();
  const { count } = await prisma.sterilePackage.updateMany({
    where: { id: packageId, clinicId: user.clinicId, usedAt: null, discardedAt: null, expiresAt: { gt: now }, load: { result: "LIBERADA" } },
    data: { surgeryId: surgery.id, usedAt: now, usedById: user.id },
  });
  if (!count) return { error: "Pacote vencido, já usado ou de carga não liberada. Não use." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CME_PACOTE", entity: "SterilePackage", entityId: packageId, patientId: surgery.patientId, details: { acao: "usou na cirurgia" } });
  revalidatePath(path(surgery.id));
  return { error: "", ok: "Pacote registrado na cirurgia." };
}
