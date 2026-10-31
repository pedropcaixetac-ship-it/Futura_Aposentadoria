"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AppointmentStatus, AppointmentType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { MAX_NAME, patientNameWhere } from "@/lib/patient";
import { requireUser } from "@/lib/auth";
import { hasTab } from "@/lib/tabs";
import { audit } from "@/lib/audit";
import { canManageAgendaOf, canStartFromAppointment, canUseReception } from "@/lib/permissions";
import { findProfessional } from "@/lib/agenda-data";
import { onlyDigits } from "@/lib/format";
import { syncAppointmentTeleconsultation } from "@/lib/teleconsulta-agenda";
import { slotTaken, withLock } from "@/lib/lock";
import { findUsableTemplate } from "@/lib/templates";
import { encounterFields } from "@/lib/encounter";
import {
  addDays,
  canCancel,
  clinicParts,
  clinicTime,
  formatTime,
  isValidDate,
  nextStatuses,
  occupiesSlot,
  overlaps,
  parseMinutes,
} from "@/lib/agenda";

export type AppointmentFormState = { error: string; warning?: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

const types: AppointmentType[] = ["CONSULTA", "RETORNO", "PROCEDIMENTO", "TELECONSULTA"];
const editableStatuses: AppointmentStatus[] = ["AGENDADO", "CONFIRMADO", "CHEGOU", "FALTOU"];

export type PatientOption = { id: string; name: string; phone: string | null; insurance: string | null };

export async function searchPatients(query: string): Promise<PatientOption[]> {
  const user = await requireUser("agenda");
  const term = query.trim();
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  return prisma.patient.findMany({
    where: {
      clinicId: user.clinicId,
      OR: [
        patientNameWhere(term),
        ...(digits.length >= 3 ? [{ cpf: { contains: digits } }, { phone: { contains: digits } }] : []),
      ],
    },
    select: { id: true, name: true, phone: true, insurance: true },
    orderBy: { name: "asc" },
    take: 8,
  });
}

// Marca uma consulta nova (appointmentId null) ou altera uma existente.
// Horário ocupado, bloqueado ou fora do expediente gera um aviso; a pessoa pode confirmar o encaixe.
export async function saveAppointment(
  appointmentId: string | null,
  _: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const user = await requireUser("agenda");

  const existing = appointmentId
    ? await prisma.appointment.findFirst({ where: { id: appointmentId, clinicId: user.clinicId } })
    : null;
  if (appointmentId) {
    if (!existing || !canManageAgendaOf(user, existing.professionalId)) return { error: "Agendamento não encontrado." };
    if (!editableStatuses.includes(existing.status)) return { error: "Esta consulta não pode mais ser alterada." };
  }

  const professionalId = text(formData, "professionalId") ?? "";
  const professional = await findProfessional(user.clinicId, professionalId);
  if (!professional || !canManageAgendaOf(user, professionalId)) return { error: "Escolha o profissional." };

  const date = text(formData, "date") ?? "";
  const startMinute = parseMinutes(text(formData, "time") ?? "");
  const duration = Number(text(formData, "duration"));
  if (!isValidDate(date) || startMinute === null) return { error: "Informe a data e o horário." };
  if (!Number.isInteger(duration) || duration < 5 || duration > 8 * 60) return { error: "Duração inválida." };

  const type = text(formData, "type") as AppointmentType;
  if (!types.includes(type)) return { error: "Escolha o tipo de consulta." };
  const insurance = text(formData, "payment") === "CONVENIO" ? text(formData, "insurance") : null;
  if (text(formData, "payment") === "CONVENIO" && !insurance) return { error: "Informe o nome do convênio." };

  const startsAt = clinicTime(date, startMinute);
  const endsAt = new Date(startsAt.getTime() + duration * 60_000);
  const slot = { start: startsAt, end: endsAt };

  // Paciente: escolhido na busca ou cadastro rápido (nome e telefone).
  let patientId = existing?.patientId ?? text(formData, "patientId");
  const newName = text(formData, "newPatientName");
  if (!existing && !patientId) {
    if (!newName || newName.length < 3) return { error: "Busque o paciente ou informe o nome completo para o cadastro rápido." };
    if (newName.length > MAX_NAME) return { error: `O nome pode ter até ${MAX_NAME} letras.` };
  }
  if (patientId) {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } });
    if (!patient) return { error: "Paciente não encontrado." };
  }

  if (formData.get("confirmFit") !== "1") {
    const warnings: string[] = [];
    const [others, blocks, hours] = await Promise.all([
      prisma.appointment.findMany({
        where: { clinicId: user.clinicId, professionalId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, NOT: { id: appointmentId ?? "" } },
        include: { patient: { select: { name: true } } },
      }),
      prisma.scheduleBlock.findMany({ where: { clinicId: user.clinicId, professionalId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } }),
      prisma.workHours.findMany({ where: { clinicId: user.clinicId, professionalId, weekday: clinicParts(startsAt).weekday } }),
    ]);
    for (const o of others.filter((o) => occupiesSlot(o.status) && overlaps(slot, { start: o.startsAt, end: o.endsAt }))) {
      warnings.push(`Já há ${o.patient.name} marcado às ${formatTime(o.startsAt)}.`);
    }
    for (const b of blocks) warnings.push(`Este horário está bloqueado${b.reason ? ` (${b.reason})` : ""}.`);
    const endMinute = startMinute + duration;
    if (!hours.some((h) => h.startMinute <= startMinute && endMinute <= h.endMinute)) {
      warnings.push("Fica fora do horário de atendimento do profissional.");
    }
    if (warnings.length) return { error: "", warning: warnings.join(" ") };
  }

  const data = { professionalId, startsAt, endsAt, type, insurance, notes: text(formData, "notes") };
  // Grava com a agenda do profissional travada: se outra pessoa (ou o paciente pelo aplicativo) pegou o horário
  // depois da conferência acima, avisa em vez de marcar dois pacientes no mesmo horário.
  type Saved = { id: string; newPatientId: string | null } | { warning: string } | { error: string };
  const saved = await withLock([`agenda:${professionalId}`], async (tx): Promise<Saved> => {
    if (formData.get("confirmFit") !== "1") {
      const taken = await slotTaken(tx, { clinicId: user.clinicId, professionalId, start: startsAt, end: endsAt, exceptId: appointmentId });
      if (taken) return { warning: `Já há ${taken.patient.name} marcado às ${formatTime(taken.startsAt)}.` };
    }
    let newPatientId: string | null = null;
    if (!patientId) {
      // Cadastro rápido: fica marcado como incompleto para a recepção completar depois.
      const patient = await tx.patient.create({
        data: { clinicId: user.clinicId, name: newName!, phone: onlyDigits(text(formData, "newPatientPhone")) || null, insurance, registrationComplete: false },
      });
      newPatientId = patientId = patient.id;
    }
    if (existing) {
      // Só altera se a consulta continua como foi aberta (ninguém desmarcou ou mudou nesse meio-tempo).
      const { count } = await tx.appointment.updateMany({ where: { id: existing.id, clinicId: user.clinicId, status: existing.status, updatedAt: existing.updatedAt }, data });
      if (count === 0) return { error: "Esta consulta acabou de ser alterada por outra pessoa. Abra de novo para ver como ficou." };
      return { id: existing.id, newPatientId };
    }
    const created = await tx.appointment.create({ data: { ...data, clinicId: user.clinicId, patientId: patientId!, createdById: user.id } });
    return { id: created.id, newPatientId };
  });
  if (!("id" in saved)) return "warning" in saved ? { error: "", warning: saved.warning } : { error: saved.error };
  const id = saved.id;
  if (saved.newPatientId) {
    await audit({ clinicId: user.clinicId, userId: user.id, action: "PACIENTE_CRIADO", entity: "Patient", entityId: saved.newPatientId, patientId: saved.newPatientId });
  }
  if (existing) {
    await audit({
      clinicId: user.clinicId,
      userId: user.id,
      action: "AGENDAMENTO_ALTERADO",
      entity: "Appointment",
      entityId: id,
      patientId,
      details: { antes: { professionalId: existing.professionalId, startsAt: existing.startsAt.toISOString() }, depois: { professionalId, startsAt: startsAt.toISOString() } },
    });
  } else {
    await audit({ clinicId: user.clinicId, userId: user.id, action: "AGENDAMENTO_CRIADO", entity: "Appointment", entityId: id, patientId });
  }
  await syncAppointmentTeleconsultation(id, user.id);
  redirect(`/agenda?data=${date}`);
}

async function loadManageable(id: string) {
  const user = await requireUser("agenda");
  const appointment = await prisma.appointment.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!appointment || !canManageAgendaOf(user, appointment.professionalId)) throw new Error("Agendamento não encontrado");
  return { user, appointment };
}

// Presença (confirmou, chegou, faltou) é marcada pela recepção.
export async function setAppointmentStatus(id: string, status: AppointmentStatus) {
  const user = await requireUser("agenda");
  if (!canUseReception(user)) throw new Error("Sem permissão");
  const appointment = await prisma.appointment.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!appointment) throw new Error("Agendamento não encontrado");
  if (!nextStatuses(appointment.status).includes(status)) throw new Error("Mudança de situação não permitida");
  // Duas recepcionistas clicando ao mesmo tempo (ou o paciente pelo aplicativo): vale só a primeira mudança.
  const { count } = await prisma.appointment.updateMany({
    where: { id, clinicId: user.clinicId, status: appointment.status },
    data: {
      status,
      arrivedAt: status === "CHEGOU" ? new Date() : status === "AGENDADO" || status === "FALTOU" ? null : appointment.arrivedAt,
      cancelReason: null,
      // Quem mexeu agora foi a recepção, não mais o paciente pelo aplicativo.
      confirmedInAppAt: null,
    },
  });
  if (count === 0) return refreshAgendaPages();
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "AGENDAMENTO_SITUACAO",
    entity: "Appointment",
    entityId: id,
    patientId: appointment.patientId,
    details: { antes: appointment.status, depois: status },
  });
  refreshAgendaPages();
}

function refreshAgendaPages() {
  revalidatePath("/recepcao");
  revalidatePath("/atender");
  revalidatePath("/agenda", "layout");
}

export async function cancelAppointment(id: string, formData: FormData) {
  const { user, appointment } = await loadManageable(id);
  if (!canCancel(appointment.status)) throw new Error("Esta consulta não pode ser desmarcada");
  const cancelReason = text(formData, "cancelReason");
  const { count } = await prisma.appointment.updateMany({ where: { id, clinicId: user.clinicId, status: appointment.status }, data: { status: "DESMARCADO", cancelReason } });
  if (count === 0) redirect(`/agenda/${id}`);
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "AGENDAMENTO_DESMARCADO",
    entity: "Appointment",
    entityId: id,
    patientId: appointment.patientId,
    details: { motivo: cancelReason },
  });
  await syncAppointmentTeleconsultation(id, user.id);
  redirect(`/agenda?data=${clinicParts(appointment.startsAt).date}`);
}

// Pode ser chamado pela Agenda ou pela aba Atender.
export async function startFromAppointment(id: string, formData: FormData) {
  const user = await requireUser();
  if (!hasTab(user, "agenda") && !hasTab(user, "atender")) throw new Error("Sem permissão");
  const appointment = await prisma.appointment.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!appointment || !canStartFromAppointment(user, appointment)) throw new Error("Sem permissão");
  if (appointment.encounterId) redirect(`/pacientes/${appointment.patientId}/atendimentos/${appointment.encounterId}`);
  if (!canCancel(appointment.status)) throw new Error("Esta consulta não pode ser iniciada");

  // Só modelos da clínica ou do próprio profissional; modelos de colegas são recusados.
  const templateId = text(formData, "templateId");
  const template = templateId ? await findUsableTemplate(user, templateId) : null;
  if (templateId && !template) throw new Error("Modelo não encontrado");

  // Clique duplo em "Iniciar": o segundo clique espera o primeiro e abre o mesmo atendimento, em vez de criar outro.
  const { encounterId, created } = await withLock([`consulta:${id}`], async (tx) => {
    const current = await tx.appointment.findFirstOrThrow({ where: { id, clinicId: user.clinicId } });
    if (current.encounterId) return { encounterId: current.encounterId, created: false };
    if (!canCancel(current.status)) throw new Error("Esta consulta não pode ser iniciada");
    const encounter = await tx.encounter.create({
      data: { clinicId: user.clinicId, patientId: current.patientId, professionalId: user.id, templateId: template?.id, fields: encounterFields(template) },
    });
    await tx.appointment.update({
      where: { id },
      data: { encounterId: encounter.id, status: "EM_ATENDIMENTO", arrivedAt: current.arrivedAt ?? new Date() },
    });
    // Teleconsulta marcada: o atendimento abre já com o painel do vídeo.
    await tx.teleconsultation.updateMany({ where: { appointmentId: id, encounterId: null }, data: { encounterId: encounter.id } });
    return { encounterId: encounter.id, created: true };
  });
  if (created) {
    await audit({ clinicId: user.clinicId, userId: user.id, action: "ATENDIMENTO_INICIADO", entity: "Encounter", entityId: encounterId, patientId: appointment.patientId });
  }
  redirect(`/pacientes/${appointment.patientId}/atendimentos/${encounterId}`);
}

// ---- Horários de atendimento e bloqueios ----

export type HoursFormState = { error: string; saved?: boolean };

// O formulário manda, para cada dia da semana, até dois períodos (manhã e tarde).
export async function saveWorkHours(professionalId: string, _: HoursFormState, formData: FormData): Promise<HoursFormState> {
  const user = await requireUser("agenda");
  if (!canManageAgendaOf(user, professionalId) || !(await findProfessional(user.clinicId, professionalId))) {
    return { error: "Sem permissão." };
  }
  const slotMinutes = Number(text(formData, "slotMinutes"));
  if (!Number.isInteger(slotMinutes) || slotMinutes < 5 || slotMinutes > 240) return { error: "Duração da consulta inválida." };

  const rows: { weekday: number; startMinute: number; endMinute: number }[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    if (formData.get(`d${weekday}_on`) !== "1") continue;
    const periods: { startMinute: number; endMinute: number }[] = [];
    for (const p of [1, 2]) {
      const start = text(formData, `d${weekday}_p${p}_start`);
      const end = text(formData, `d${weekday}_p${p}_end`);
      if (!start && !end) continue;
      const startMinute = parseMinutes(start ?? "");
      const endMinute = parseMinutes(end ?? "");
      if (startMinute === null || endMinute === null || endMinute <= startMinute) {
        return { error: "Confira os horários: o fim de cada período precisa ser depois do início." };
      }
      periods.push({ startMinute, endMinute });
    }
    if (periods.length === 2 && periods[0].endMinute > periods[1].startMinute && periods[1].endMinute > periods[0].startMinute) {
      return { error: "Os dois períodos de um mesmo dia não podem se sobrepor." };
    }
    rows.push(...periods.map((p) => ({ weekday, ...p })));
  }

  await prisma.$transaction([
    prisma.workHours.deleteMany({ where: { clinicId: user.clinicId, professionalId } }),
    prisma.workHours.createMany({ data: rows.map((r) => ({ ...r, slotMinutes, clinicId: user.clinicId, professionalId })) }),
  ]);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "HORARIOS_ALTERADOS", entity: "User", entityId: professionalId });
  revalidatePath("/agenda", "layout");
  return { error: "", saved: true };
}

export async function createBlock(professionalId: string, _: HoursFormState, formData: FormData): Promise<HoursFormState> {
  const user = await requireUser("agenda");
  if (!canManageAgendaOf(user, professionalId) || !(await findProfessional(user.clinicId, professionalId))) {
    return { error: "Sem permissão." };
  }
  const startDate = text(formData, "startDate") ?? "";
  const endDate = text(formData, "endDate") ?? startDate;
  if (!isValidDate(startDate) || !isValidDate(endDate)) return { error: "Informe as datas do bloqueio." };
  const allDay = formData.get("allDay") === "1";
  const startMinute = allDay ? 0 : parseMinutes(text(formData, "startTime") ?? "");
  const endMinute = allDay ? 24 * 60 : parseMinutes(text(formData, "endTime") ?? "");
  if (startMinute === null || endMinute === null) return { error: "Informe os horários do bloqueio ou marque o dia inteiro." };

  const startsAt = clinicTime(startDate, startMinute);
  const endsAt = clinicTime(endDate, endMinute);
  if (endsAt <= startsAt) return { error: "O fim do bloqueio precisa ser depois do início." };

  const block = await prisma.scheduleBlock.create({
    data: { clinicId: user.clinicId, professionalId, startsAt, endsAt, reason: text(formData, "reason") },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "BLOQUEIO_CRIADO", entity: "ScheduleBlock", entityId: block.id });
  revalidatePath("/agenda", "layout");
  return { error: "", saved: true };
}

export async function deleteBlock(id: string) {
  const user = await requireUser("agenda");
  const block = await prisma.scheduleBlock.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!block || !canManageAgendaOf(user, block.professionalId)) throw new Error("Bloqueio não encontrado");
  await prisma.scheduleBlock.delete({ where: { id } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "BLOQUEIO_EXCLUIDO", entity: "ScheduleBlock", entityId: id });
  revalidatePath("/agenda", "layout");
}

// Anota (ou apaga) a data prevista do retorno, que aparece em "Retornos para avisar" na Recepção.
export async function setReturnDue(id: string, formData: FormData) {
  const user = await requireUser("agenda");
  const appointment = await prisma.appointment.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!appointment || !canManageAgendaOf(user, appointment.professionalId)) return;

  const days = Number(formData.get("days"));
  const date = text(formData, "date");
  let returnDueOn: Date | null = null;
  if (formData.get("clear")) {
    returnDueOn = null;
  } else if (Number.isInteger(days) && days > 0) {
    returnDueOn = new Date(`${addDays(clinicParts(appointment.startsAt).date, days)}T00:00:00Z`);
  } else if (isValidDate(date ?? undefined)) {
    returnDueOn = new Date(`${date}T00:00:00Z`);
  }
  await prisma.appointment.update({ where: { id }, data: { returnDueOn, returnNoticeSentAt: null } });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "RETORNO_PREVISTO",
    entity: "Appointment",
    entityId: id,
    patientId: appointment.patientId,
    details: { retorno: returnDueOn?.toISOString().slice(0, 10) ?? null },
  });
  revalidatePath(`/agenda/${id}`);
  revalidatePath("/recepcao", "layout");
}
