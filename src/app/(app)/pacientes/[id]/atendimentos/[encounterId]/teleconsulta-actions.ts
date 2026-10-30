"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canViewClinical } from "@/lib/permissions";
import { teleconsultationState } from "@/lib/teleconsulta";
import { ensureRoom } from "@/lib/teleconsulta-sala";
import { deleteRoom, joinUrl } from "@/lib/video";

// Só o profissional responsável entra na chamada e a encerra.
async function loadOwn(teleconsultationId: string) {
  const user = await requireUser("pacientes");
  const t = await prisma.teleconsultation.findFirst({
    where: { id: teleconsultationId, clinicId: user.clinicId, professionalId: user.id },
  });
  if (!t) throw new Error("Teleconsulta não encontrada");
  return { user, t };
}

// Consultado a cada poucos segundos pela tela do profissional.
export async function teleconsultationStatus(teleconsultationId: string) {
  const user = await requireUser("pacientes");
  if (!canViewClinical(user)) throw new Error("Sem permissão");
  const t = await prisma.teleconsultation.findFirst({
    where: { id: teleconsultationId, clinicId: user.clinicId },
    select: { consentAt: true, patientJoinedAt: true, endedAt: true },
  });
  return {
    consentAt: t?.consentAt?.toISOString() ?? null,
    patientJoinedAt: t?.patientJoinedAt?.toISOString() ?? null,
    ended: !!t?.endedAt,
  };
}

export async function joinTeleconsultation(teleconsultationId: string): Promise<{ url?: string; error?: string }> {
  const { user, t } = await loadOwn(teleconsultationId);
  const state = teleconsultationState(t);
  if (state === "ENCERRADA" || state === "EXPIRADA") return { error: "Esta teleconsulta já terminou." };
  try {
    const room = await ensureRoom(t);
    const url = await joinUrl(room, user.name, true);
    if (!t.professionalJoinedAt) {
      await prisma.teleconsultation.update({ where: { id: t.id }, data: { professionalJoinedAt: new Date() } });
    }
    await audit({
      clinicId: user.clinicId,
      userId: user.id,
      action: "TELECONSULTA_PROFISSIONAL_ENTROU",
      entity: "Teleconsultation",
      entityId: t.id,
      patientId: t.patientId,
    });
    return { url };
  } catch (e) {
    console.error(e);
    return { error: "Não foi possível abrir a chamada de vídeo. Verifique a configuração da teleconsulta." };
  }
}

export async function endTeleconsultation(teleconsultationId: string) {
  const { user, t } = await loadOwn(teleconsultationId);
  if (t.endedAt) return;
  await prisma.teleconsultation.update({ where: { id: t.id }, data: { endedAt: new Date() } });
  // Apagar a sala tira todo mundo da chamada na hora.
  if (t.roomName) await deleteRoom(t.roomName).catch((e) => console.error(e));
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "TELECONSULTA_ENCERRADA",
    entity: "Teleconsultation",
    entityId: t.id,
    patientId: t.patientId,
  });
  revalidatePath(`/pacientes/${t.patientId}/atendimentos/${t.encounterId}`);
}
