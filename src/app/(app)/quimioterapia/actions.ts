"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAdministerChemo } from "@/lib/hospital-roles";
import { audit } from "@/lib/audit";
import { withLock } from "@/lib/lock";
import { isPhysician } from "@/lib/pronto-socorro";
import { kitchenDate as todayDate } from "@/lib/cozinha";
import { bodySurface, buildSessions, DOSE_UNITS, parseDays, protocolDrugs, type DoseUnit, type ProtocolDrug } from "@/lib/quimio";

export type FormState = { error: string; ok?: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function number(formData: FormData, key: string) {
  const raw = text(formData, key)?.replace(",", ".");
  const n = raw === undefined || raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

const DAY = 24 * 3600_000;
// A liberação vale para exames recentes: no máximo 3 dias antes da sessão.
const RELEASE_DAYS = 3;
const onlyDoctor = "Só médico (CRM) pode fazer isso.";

export async function saveProtocol(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("quimioterapia");
  if (!isPhysician(user)) return { error: onlyDoctor };
  const name = text(formData, "name");
  if (!name) return { error: "Informe o nome do protocolo." };
  const cycleDays = number(formData, "cycleDays");
  if (!cycleDays || !Number.isInteger(cycleDays) || cycleDays < 1 || cycleDays > 365) return { error: "Informe de quantos em quantos dias é o ciclo." };
  const drugs: ProtocolDrug[] = [];
  for (let i = 0; i < 6; i++) {
    const drug = text(formData, `drug${i}`);
    if (!drug) continue;
    const dose = number(formData, `dose${i}`);
    const unit = text(formData, `unit${i}`) as DoseUnit | null;
    const days = parseDays(text(formData, `days${i}`) ?? "");
    if (!dose || dose <= 0) return { error: `Informe a dose de ${drug}.` };
    if (!unit || !DOSE_UNITS.includes(unit)) return { error: `Escolha a unidade de ${drug}.` };
    if (!days) return { error: `Informe os dias de ${drug} (ex.: 1 ou 1, 8 ou 1-5).` };
    if (days.some((d) => d > cycleDays)) return { error: `${drug}: o dia ${days.at(-1)} passa do ciclo de ${cycleDays} dias.` };
    drugs.push({ drug, dose, unit, route: text(formData, `route${i}`) ?? "EV", days });
  }
  if (drugs.length === 0) return { error: "Informe ao menos um medicamento." };
  try {
    const protocol = await prisma.chemoProtocol.create({ data: { clinicId: user.clinicId, name, cycleDays, drugs, note: text(formData, "note") } });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "QUIMIO_PROTOCOLO", entity: "ChemoProtocol", entityId: protocol.id, details: { protocolo: name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Já existe um protocolo com esse nome." };
    throw e;
  }
  revalidatePath("/quimioterapia/protocolos");
  return { error: "", ok: `Protocolo ${name} cadastrado.` };
}

// Inicia o tratamento: calcula a superfície corporal e grava todas as sessões com as doses.
export async function startPlan(patientId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("quimioterapia");
  if (!isPhysician(user)) return { error: onlyDoctor };
  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } });
  if (!patient) return { error: "Paciente não encontrado." };
  const protocol = await prisma.chemoProtocol.findFirst({ where: { id: text(formData, "protocolId") ?? "", clinicId: user.clinicId, active: true } });
  if (!protocol) return { error: "Escolha o protocolo." };
  const startRaw = text(formData, "startDate");
  const startDate = startRaw ? new Date(`${startRaw}T00:00:00Z`) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) return { error: "Informe a data do primeiro dia." };
  if (startDate.getTime() < todayDate().getTime() - 30 * DAY) return { error: "A data de início está muito no passado." };
  const cycles = number(formData, "cycles");
  if (!cycles || !Number.isInteger(cycles) || cycles < 1 || cycles > 60) return { error: "Informe o número de ciclos." };
  const heightCm = number(formData, "heightCm");
  if (!heightCm || !Number.isInteger(heightCm) || heightCm < 30 || heightCm > 250) return { error: "Informe a altura em centímetros (ex.: 165)." };
  const weightKg = number(formData, "weightKg");
  if (!weightKg || weightKg <= 0 || weightKg > 400) return { error: "Informe o peso em kg (ex.: 68,5)." };
  const doseLevel = number(formData, "doseLevel") ?? 100;
  if (!Number.isInteger(doseLevel) || doseLevel < 10 || doseLevel > 150) return { error: "O percentual da dose vai de 10 a 150." };

  const bsa = bodySurface(heightCm, weightKg);
  const sessions = buildSessions(protocolDrugs(protocol.drugs), protocol.cycleDays, cycles, startDate, { bsa, weightKg, doseLevel });
  // Clique duplo em "Iniciar" não pode abrir dois tratamentos iguais (doses em dobro na agenda da quimio).
  const plan = await withLock([`quimio-paciente:${patient.id}`], async (tx) => {
    const same = await tx.chemoPlan.findFirst({ where: { clinicId: user.clinicId, patientId: patient.id, protocolId: protocol.id, endedAt: null }, select: { id: true } });
    if (same) return null;
    const plan = await tx.chemoPlan.create({
      data: { clinicId: user.clinicId, patientId: patient.id, protocolId: protocol.id, physicianId: user.id, startDate, cycles, heightCm, weightKg, bsa, doseLevel, note: text(formData, "note") },
    });
    await tx.chemoSession.createMany({
      data: sessions.map((s) => ({ clinicId: user.clinicId, planId: plan.id, patientId: patient.id, cycle: s.cycle, day: s.day, date: s.date, doses: s.doses })),
    });
    return plan;
  });
  if (!plan) return { error: `Este paciente já tem um tratamento ${protocol.name} em andamento. Encerre o anterior antes de começar outro igual.` };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "QUIMIO_TRATAMENTO", entity: "ChemoPlan", entityId: plan.id, patientId: patient.id, details: { protocolo: protocol.name, ciclos: cycles, sc: bsa } });
  redirect(`/quimioterapia/${plan.id}`);
}

async function loadSession(sessionId: string, clinicId: string) {
  return prisma.chemoSession.findFirst({ where: { id: sessionId, clinicId, plan: { endedAt: null } } });
}

// Médico libera a sessão (exames e condições do paciente conferidos).
export async function releaseSession(sessionId: string): Promise<FormState> {
  const user = await requireUser("quimioterapia");
  if (!isPhysician(user)) return { error: onlyDoctor };
  const session = await loadSession(sessionId, user.clinicId);
  if (!session) return { error: "Sessão não encontrada." };
  if (session.date.getTime() > todayDate().getTime() + RELEASE_DAYS * DAY) return { error: `Só dá para liberar até ${RELEASE_DAYS} dias antes, com exames recentes.` };
  const { count } = await prisma.chemoSession.updateMany({ where: { id: session.id, clinicId: user.clinicId, status: "AGENDADA", releasedAt: null }, data: { releasedAt: new Date(), releasedById: user.id } });
  if (!count) return { error: "A sessão já foi liberada ou não está mais agendada." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "QUIMIO_SESSAO", entity: "ChemoSession", entityId: session.id, patientId: session.patientId, details: { acao: "liberou", ciclo: session.cycle, dia: session.day } });
  revalidatePath("/quimioterapia");
  revalidatePath(`/quimioterapia/${session.planId}`);
  return { error: "", ok: "Liberada para aplicação." };
}

// Enfermagem registra a aplicação. Só depois da liberação do médico e nunca antes do dia.
export async function administerSession(sessionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("quimioterapia");
  if (!canAdministerChemo(user)) return { error: "A aplicação de quimioterapia é feita pelo enfermeiro (COREN)." };
  const session = await loadSession(sessionId, user.clinicId);
  if (!session) return { error: "Sessão não encontrada." };
  if (session.date.getTime() > todayDate().getTime()) return { error: "Esta sessão é de outro dia." };
  const { count } = await prisma.chemoSession.updateMany({
    where: { id: session.id, clinicId: user.clinicId, status: "AGENDADA", releasedAt: { not: null } },
    data: { status: "REALIZADA", administeredAt: new Date(), administeredById: user.id, note: text(formData, "note") },
  });
  if (!count) return { error: "A sessão precisa ser liberada pelo médico antes." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "QUIMIO_SESSAO", entity: "ChemoSession", entityId: session.id, patientId: session.patientId, details: { acao: "aplicou", ciclo: session.cycle, dia: session.day } });
  revalidatePath("/quimioterapia");
  revalidatePath(`/quimioterapia/${session.planId}`);
  return { error: "", ok: "Aplicação registrada." };
}

// Adiar: muda a data desta sessão e empurra as próximas do tratamento pelos mesmos dias. A liberação volta a ser necessária.
export async function postponeSession(sessionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("quimioterapia");
  if (!isPhysician(user)) return { error: onlyDoctor };
  const session = await loadSession(sessionId, user.clinicId);
  if (!session || session.status !== "AGENDADA") return { error: "Só sessão agendada pode ser adiada." };
  const raw = text(formData, "newDate");
  const newDate = raw ? new Date(`${raw}T00:00:00Z`) : null;
  if (!newDate || Number.isNaN(newDate.getTime())) return { error: "Informe a nova data." };
  const shift = Math.round((newDate.getTime() - session.date.getTime()) / DAY);
  if (shift <= 0) return { error: "A nova data precisa ser depois da data marcada." };
  const reason = text(formData, "reason");
  if (!reason) return { error: "Informe o motivo (ex.: neutropenia)." };
  // Uma alteração por vez no mesmo tratamento: clique duplo não adia duas vezes, e sessão aplicada não muda de data.
  const following = await withLock([`quimio-plano:${session.planId}`], async (tx) => {
    const fresh = await tx.chemoSession.findFirst({ where: { id: session.id, clinicId: user.clinicId, status: "AGENDADA", date: session.date } });
    if (!fresh) return null;
    const list = await tx.chemoSession.findMany({ where: { clinicId: user.clinicId, planId: session.planId, status: "AGENDADA", date: { gte: session.date } } });
    for (const s of list) {
      await tx.chemoSession.updateMany({
        where: { id: s.id, clinicId: user.clinicId, status: "AGENDADA" },
        data: {
          date: new Date(s.date.getTime() + shift * DAY),
          releasedAt: null,
          releasedById: null,
          ...(s.id === session.id ? { note: `Adiada ${shift} dia(s): ${reason}` } : {}),
        },
      });
    }
    return list;
  });
  if (!following) return { error: "Esta sessão acabou de ser alterada por outra pessoa. Recarregue a página." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "QUIMIO_SESSAO", entity: "ChemoSession", entityId: session.id, patientId: session.patientId, details: { acao: "adiou", dias: shift, motivo: reason, sessoes: following.length } });
  revalidatePath("/quimioterapia");
  revalidatePath(`/quimioterapia/${session.planId}`);
  return { error: "", ok: `Adiada ${shift} dia(s), junto com as ${following.length - 1} sessões seguintes.` };
}

export async function cancelSession(sessionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("quimioterapia");
  if (!isPhysician(user)) return { error: onlyDoctor };
  const reason = text(formData, "reason");
  if (!reason) return { error: "Informe o motivo." };
  const session = await loadSession(sessionId, user.clinicId);
  if (!session) return { error: "Sessão não encontrada." };
  const { count } = await prisma.chemoSession.updateMany({ where: { id: session.id, clinicId: user.clinicId, status: "AGENDADA" }, data: { status: "CANCELADA", note: reason } });
  if (!count) return { error: "Só sessão agendada pode ser cancelada." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "QUIMIO_SESSAO", entity: "ChemoSession", entityId: session.id, patientId: session.patientId, details: { acao: "cancelou", motivo: reason } });
  revalidatePath(`/quimioterapia/${session.planId}`);
  return { error: "", ok: "Sessão cancelada." };
}

// Encerra o tratamento (fim, toxicidade, troca de protocolo...). As sessões que faltavam ficam canceladas.
export async function endPlan(planId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("quimioterapia");
  if (!isPhysician(user)) return { error: onlyDoctor };
  const reason = text(formData, "reason");
  if (!reason) return { error: "Informe o motivo." };
  const plan = await prisma.chemoPlan.findFirst({ where: { id: planId, clinicId: user.clinicId, endedAt: null } });
  if (!plan) return { error: "Tratamento já encerrado." };
  await prisma.$transaction([
    prisma.chemoSession.updateMany({ where: { clinicId: user.clinicId, planId: plan.id, status: "AGENDADA" }, data: { status: "CANCELADA", note: `Tratamento encerrado: ${reason}` } }),
    prisma.chemoPlan.update({ where: { id: plan.id }, data: { endedAt: new Date(), endedById: user.id, endReason: reason } }),
  ]);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "QUIMIO_TRATAMENTO_ENCERRADO", entity: "ChemoPlan", entityId: plan.id, patientId: plan.patientId, details: { motivo: reason } });
  revalidatePath(`/quimioterapia/${plan.id}`);
  return { error: "", ok: "Tratamento encerrado." };
}
