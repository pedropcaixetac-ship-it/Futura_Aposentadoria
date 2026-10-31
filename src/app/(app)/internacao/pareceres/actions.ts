"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { withLock } from "@/lib/lock";
import { canAnswerConsult, canRequestConsult, canTakeOver, canTransferAttending, sameSpecialty } from "@/lib/especialidades";
import { isDoctor } from "@/lib/hospital-roles";
import { loadSpecialties } from "./data";

export type FormState = { error: string; ok?: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

// Mesmas travas da internação (ver internacao/actions.ts): troca de médico, alta e troca de leito passam uma de cada vez.
const admissionKey = (admissionId: string) => `internacao:${admissionId}`;

function refresh(admissionId: string) {
  revalidatePath(`/internacao/${admissionId}`);
  revalidatePath(`/internacao/${admissionId}/pareceres`);
  revalidatePath("/internacao/pareceres");
}

export async function requestConsult(admissionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("internacao");
  if (!canRequestConsult(user)) return { error: "O pedido de parecer é feito pelo médico (CRM)." };
  const admission = await prisma.admission.findFirst({ where: { id: admissionId, clinicId: user.clinicId, dischargedAt: null } });
  if (!admission) return { error: "Internação não encontrada ou o paciente já teve alta." };
  const specialties = await loadSpecialties(user.clinicId);
  const specialty = specialties.find((s) => sameSpecialty(s, text(formData, "specialty")));
  if (!specialty) return { error: "Escolha a especialidade." };
  if (sameSpecialty(specialty, admission.specialty)) return { error: `O paciente já está com a ${specialty}. Peça parecer a outra especialidade.` };
  const question = text(formData, "question");
  if (!question) return { error: "Escreva o motivo do parecer (a pergunta para a outra especialidade)." };
  const consultantId = text(formData, "consultantId");
  const consultant = consultantId
    ? await prisma.user.findFirst({ where: { id: consultantId, clinicId: user.clinicId, active: true }, select: { id: true, specialty: true } })
    : null;
  if (consultantId && (!consultant || !sameSpecialty(consultant.specialty, specialty))) return { error: "O profissional escolhido não é dessa especialidade." };

  // Clique duplo (ou dois médicos da equipe pedindo juntos): um pedido pendente por especialidade.
  const created = await withLock([`parecer:${admission.id}:${specialty.toLowerCase()}`], async (tx) => {
    const pending = await tx.consultRequest.findFirst({ where: { clinicId: user.clinicId, admissionId: admission.id, specialty, status: "PENDENTE" }, select: { id: true } });
    if (pending) return null;
    return tx.consultRequest.create({
      data: {
        clinicId: user.clinicId,
        admissionId: admission.id,
        patientId: admission.patientId,
        specialty,
        consultantId: consultant?.id ?? null,
        urgent: formData.get("urgent") === "on",
        question,
        requestedById: user.id,
      },
    });
  });
  if (!created) return { error: `Já existe um pedido de parecer da ${specialty} esperando resposta para este paciente.` };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PARECER_PEDIDO", entity: "ConsultRequest", entityId: created.id, patientId: admission.patientId, details: { especialidade: specialty, urgente: created.urgent } });
  refresh(admission.id);
  return { error: "", ok: `Parecer pedido à ${specialty}${created.urgent ? " (urgente)" : ""}.` };
}

export async function answerConsult(consultId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("internacao");
  const consult = await prisma.consultRequest.findFirst({ where: { id: consultId, clinicId: user.clinicId } });
  if (!consult) return { error: "Pedido de parecer não encontrado." };
  if (!canAnswerConsult(user, consult)) {
    return { error: consult.consultantId ? "Este parecer foi pedido a outro profissional." : `Este parecer é para a ${consult.specialty}.` };
  }
  const answer = text(formData, "answer");
  if (!answer) return { error: "Escreva o parecer." };
  const takeOver = formData.get("takeOver") === "on";
  if (takeOver && !canTakeOver(user)) return { error: "Só o médico (CRM) assume o paciente." };

  // Dois especialistas respondendo ao mesmo tempo: vale o primeiro. Assumir o paciente usa a trava da internação.
  const result = await withLock([`parecer-resposta:${consult.id}`, admissionKey(consult.admissionId)], async (tx) => {
    const admission = await tx.admission.findFirst({ where: { id: consult.admissionId, clinicId: user.clinicId } });
    if (!admission) return "Internação não encontrada.";
    if (takeOver && admission.dischargedAt) return "O paciente já teve alta: responda sem assumir.";
    const { count } = await tx.consultRequest.updateMany({
      where: { id: consult.id, clinicId: user.clinicId, status: "PENDENTE" },
      data: { status: "RESPONDIDO", answer, answeredById: user.id, answeredAt: new Date(), tookOver: takeOver && admission.attendingId !== user.id },
    });
    if (!count) return "Este parecer acabou de ser respondido ou cancelado por outra pessoa.";
    if (takeOver && admission.attendingId !== user.id) {
      await tx.admission.update({ where: { id: admission.id }, data: { attendingId: user.id, specialty: consult.specialty } });
      await tx.attendingChange.create({
        data: {
          clinicId: user.clinicId, admissionId: admission.id, fromAttendingId: admission.attendingId, toAttendingId: user.id,
          fromSpecialty: admission.specialty, toSpecialty: consult.specialty, reason: "Assumiu ao responder o parecer", consultId: consult.id, changedById: user.id,
        },
      });
    }
    return null;
  });
  if (result) return { error: result };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PARECER_RESPONDIDO", entity: "ConsultRequest", entityId: consult.id, patientId: consult.patientId, details: { especialidade: consult.specialty, assumiu: takeOver } });
  refresh(consult.admissionId);
  return { error: "", ok: takeOver ? `Parecer respondido. O paciente agora é da ${consult.specialty}, com você como responsável.` : "Parecer respondido." };
}

export async function cancelConsult(consultId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("internacao");
  const consult = await prisma.consultRequest.findFirst({ where: { id: consultId, clinicId: user.clinicId } });
  if (!consult) return { error: "Pedido de parecer não encontrado." };
  if (consult.requestedById !== user.id && !isDoctor(user)) return { error: "Só o médico cancela o pedido de parecer." };
  const reason = text(formData, "reason");
  if (!reason) return { error: "Informe o motivo do cancelamento." };
  const { count } = await prisma.consultRequest.updateMany({
    where: { id: consult.id, clinicId: user.clinicId, status: "PENDENTE" },
    data: { status: "CANCELADO", canceledAt: new Date(), canceledById: user.id, cancelReason: reason },
  });
  if (!count) return { error: "Este parecer já foi respondido ou cancelado." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PARECER_CANCELADO", entity: "ConsultRequest", entityId: consult.id, patientId: consult.patientId, details: { motivo: reason } });
  refresh(consult.admissionId);
  return { error: "", ok: "Pedido de parecer cancelado." };
}

// Transferência de especialidade: o paciente passa a ser cuidado por outro médico (e pela especialidade dele).
// expectedAttendingId vem da tela: se outra pessoa transferiu antes, o pedido é recusado em vez de passar por cima.
export async function transferAttending(admissionId: string, expectedAttendingId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("internacao");
  if (!canTransferAttending(user)) return { error: "A transferência de especialidade é feita pelo médico (CRM)." };
  const target = await prisma.user.findFirst({
    where: { id: text(formData, "toAttendingId") ?? "", clinicId: user.clinicId, active: true },
    select: { id: true, name: true, specialty: true, role: true, councilType: true, councilNumber: true },
  });
  if (!target || !isDoctor(target)) return { error: "Escolha o médico (CRM) que vai assumir o paciente." };
  const reason = text(formData, "reason");
  if (!reason) return { error: "Informe o motivo da transferência." };

  const result = await withLock([admissionKey(admissionId)], async (tx) => {
    const admission = await tx.admission.findFirst({ where: { id: admissionId, clinicId: user.clinicId } });
    if (!admission) return { error: "Internação não encontrada." };
    if (admission.dischargedAt) return { error: "O paciente já teve alta." };
    if (admission.attendingId !== expectedAttendingId) return { error: "Outra pessoa acabou de transferir este paciente. Recarregue a página para ver quem é o responsável agora." };
    if (admission.attendingId === target.id) return { error: "Este médico já é o responsável." };
    const toSpecialty = target.specialty?.trim() || admission.specialty;
    await tx.admission.update({ where: { id: admission.id }, data: { attendingId: target.id, specialty: toSpecialty } });
    await tx.attendingChange.create({
      data: {
        clinicId: user.clinicId, admissionId: admission.id, fromAttendingId: admission.attendingId, toAttendingId: target.id,
        fromSpecialty: admission.specialty, toSpecialty, reason, changedById: user.id,
      },
    });
    return { error: "", patientId: admission.patientId, from: admission.specialty, to: toSpecialty };
  });
  if (result.error) return { error: result.error };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "INTERNACAO_ESPECIALIDADE_TROCADA", entity: "Admission", entityId: admissionId, patientId: result.patientId, details: { de: result.from, para: result.to, medico: target.name, motivo: reason } });
  refresh(admissionId);
  return { error: "", ok: `Paciente transferido para ${target.name}${result.to ? ` (${result.to})` : ""}.` };
}
