"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type ExamPriority, type ExamSector } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canReleaseLabResult } from "@/lib/hospital-roles";
import { audit } from "@/lib/audit";
import { withLock } from "@/lib/lock";
import { canWorkClinical } from "@/lib/permissions";
import { isPhysician } from "@/lib/pronto-socorro";
import { hasTab, type TabKey } from "@/lib/tabs";
import { asFields, MODALITIES, parseFields, sectorLabel, type ResultValue } from "@/lib/exames";

export type FormState = { error: string; ok?: string };
// Onde o exame foi pedido: internação ou pronto-socorro (o ambulatorial é agendado pela recepção).
export type ExamContext = { kind: "internacao" | "ps"; id: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

// Quem trabalha com exames: laboratório, imagem, recepção dos exames, internação ou pronto-socorro.
const EXAM_TABS: TabKey[] = ["laboratorio", "imagem", "exames", "internacao", "pronto-socorro"];
async function examUser() {
  const user = await requireUser();
  if (!EXAM_TABS.some((t) => hasTab(user, t))) throw new Error("Sem permissão");
  return user;
}

function revalidateAll() {
  for (const p of ["/laboratorio", "/imagem", "/exames"]) revalidatePath(p);
}

// Catálogo: quem tem a aba do setor (ou a gerência) cadastra os exames.
export async function saveExamType(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("laboratorio");
  const sector = text(formData, "sector") as ExamSector | null;
  if (!sector || !(sector in sectorLabel)) return { error: "Escolha o setor." };
  const name = text(formData, "name");
  if (!name) return { error: "Informe o nome do exame." };
  const modality = text(formData, "modality");
  if (sector === "IMAGEM" && (!modality || !MODALITIES.includes(modality))) return { error: "Escolha a modalidade do exame de imagem." };
  const fields = sector === "LABORATORIO" ? parseFields(text(formData, "fields") ?? "") : [];
  if (!fields) return { error: 'Confira os campos: um por linha, "nome; unidade; mínimo; máximo".' };
  if (sector === "LABORATORIO" && fields.length === 0) return { error: "Informe ao menos um campo do resultado." };
  try {
    const type = await prisma.examType.create({
      data: { clinicId: user.clinicId, sector, name, modality: sector === "IMAGEM" ? modality : null, sample: text(formData, "sample"), preparation: text(formData, "preparation"), fields },
    });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "EXAME_CATALOGO", entity: "ExamType", entityId: type.id, details: { exame: name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Já existe um exame com esse nome." };
    throw e;
  }
  revalidatePath("/laboratorio/catalogo");
  return { error: "", ok: `${name} cadastrado.` };
}

// Médico pede exames para quem está internado ou no pronto-socorro (vários de uma vez).
export async function requestExams(ctx: ExamContext, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(ctx.kind === "internacao" ? "internacao" : "pronto-socorro");
  if (!isPhysician(user)) return { error: "Só o médico pede exames." };
  const context = ctx.kind === "internacao"
    ? await prisma.admission.findFirst({ where: { id: ctx.id, clinicId: user.clinicId, dischargedAt: null }, select: { id: true, patientId: true } })
    : await prisma.emergencyVisit.findFirst({ where: { id: ctx.id, clinicId: user.clinicId, closedAt: null }, select: { id: true, patientId: true } });
  if (!context) return { error: "O paciente já saiu." };
  const ids = formData.getAll("examTypeId").map(String);
  if (ids.length === 0) return { error: "Marque os exames." };
  const types = await prisma.examType.findMany({ where: { id: { in: ids }, clinicId: user.clinicId, active: true } });
  if (types.length !== ids.length) return { error: "Exame não encontrado no catálogo." };
  const priority: ExamPriority = formData.get("priority") === "URGENTE" ? "URGENTE" : "ROTINA";
  const clinicalInfo = text(formData, "clinicalInfo");
  await prisma.examRequest.createMany({
    data: types.map((t) => ({
      clinicId: user.clinicId, patientId: context.patientId, examTypeId: t.id, requestedById: user.id, createdById: user.id, priority, clinicalInfo,
      ...(ctx.kind === "internacao" ? { admissionId: context.id } : { emergencyVisitId: context.id }),
    })),
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "EXAME_PEDIDO", entity: ctx.kind === "internacao" ? "Admission" : "EmergencyVisit", entityId: context.id, patientId: context.patientId, details: { exames: types.map((t) => t.name).join(", "), prioridade: priority } });
  revalidatePath(ctx.kind === "internacao" ? `/internacao/${ctx.id}/exames` : `/pronto-socorro/${ctx.id}`);
  revalidateAll();
  return { error: "", ok: `${types.length} exame(s) pedido(s).` };
}

// Recepção agenda o exame (pedido de médico de fora ou do ambulatório). O mesmo aparelho não recebe dois no mesmo horário.
export async function scheduleExam(patientId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("exames");
  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } });
  if (!patient) return { error: "Paciente não encontrado." };
  const type = await prisma.examType.findFirst({ where: { id: text(formData, "examTypeId") ?? "", clinicId: user.clinicId, active: true } });
  if (!type) return { error: "Escolha o exame." };
  const raw = text(formData, "scheduledAt");
  const scheduledAt = raw ? new Date(`${raw}:00-03:00`) : null;
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return { error: "Informe o dia e a hora." };
  if (scheduledAt.getTime() < Date.now() - 30 * 60_000) return { error: "O horário já passou." };
  const requesterId = text(formData, "requestedById");
  const requester = requesterId ? await prisma.user.findFirst({ where: { id: requesterId, clinicId: user.clinicId, active: true } }) : null;
  if (requesterId && (!requester || !isPhysician(requester))) return { error: "Escolha o médico que pediu." };
  const externalRequester = requester ? null : text(formData, "externalRequester");
  if (!requester && !externalRequester) return { error: "Informe o médico que pediu (nome e CRM)." };

  const key = type.sector === "IMAGEM" ? `exame:${type.modality}` : `exame:lab:${scheduledAt.toISOString()}`;
  const result = await withLock([key], async (tx) => {
    if (type.sector === "IMAGEM") {
      const clash = await tx.examRequest.findFirst({
        where: { clinicId: user.clinicId, scheduledAt, status: { in: ["AGENDADO", "SOLICITADO"] }, examType: { modality: type.modality } },
        select: { id: true },
      });
      if (clash) return { error: `Já há um exame de ${type.modality?.toLowerCase()} marcado nesse horário.` };
    }
    const exam = await tx.examRequest.create({
      data: {
        clinicId: user.clinicId, patientId: patient.id, examTypeId: type.id, requestedById: requester?.id ?? null, externalRequester, createdById: user.id,
        status: "AGENDADO", scheduledAt, clinicalInfo: text(formData, "clinicalInfo"),
      },
    });
    return { error: "", id: exam.id };
  });
  if (result.error) return { error: result.error };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "EXAME_AGENDADO", entity: "ExamRequest", entityId: result.id!, patientId: patient.id, details: { exame: type.name } });
  revalidateAll();
  return { error: "", ok: `${type.name} agendado.${type.preparation ? ` Preparo: ${type.preparation}` : ""}` };
}

// Coleta (laboratório) ou realização do exame de imagem.
export async function collectExam(examId: string): Promise<FormState> {
  const user = await examUser();
  if (!canWorkClinical(user)) return { error: "Só a equipe de saúde registra a coleta." };
  const exam = await prisma.examRequest.findFirst({ where: { id: examId, clinicId: user.clinicId }, select: { id: true, patientId: true } });
  if (!exam) return { error: "Exame não encontrado." };
  const { count } = await prisma.examRequest.updateMany({
    where: { id: exam.id, clinicId: user.clinicId, status: { in: ["SOLICITADO", "AGENDADO"] } },
    data: { status: "COLETADO", collectedAt: new Date(), collectedById: user.id },
  });
  if (!count) return { error: "Este exame já foi coletado ou cancelado." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "EXAME_COLETADO", entity: "ExamRequest", entityId: exam.id, patientId: exam.patientId });
  revalidateAll();
  return { error: "", ok: "Registrado." };
}

// Resultado do laboratório: um valor por campo do catálogo. Liberado por profissional com conselho.
export async function saveLabResult(examId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("laboratorio");
  if (!canReleaseLabResult(user)) return { error: "O resultado é liberado pelo biomédico, farmacêutico ou médico." };
  const exam = await prisma.examRequest.findFirst({ where: { id: examId, clinicId: user.clinicId }, include: { examType: true } });
  if (!exam || exam.examType.sector !== "LABORATORIO") return { error: "Exame não encontrado." };
  const fields = asFields(exam.examType.fields);
  const values: ResultValue[] = fields.map((f, i) => ({ name: f.name, unit: f.unit, min: f.min, max: f.max, value: text(formData, `v${i}`) ?? "" }));
  const empty = values.find((v) => !v.value);
  if (empty) return { error: `Preencha ${empty.name}.` };
  const { count } = await prisma.examRequest.updateMany({
    where: { id: exam.id, clinicId: user.clinicId, status: "COLETADO" },
    data: { status: "LAUDADO", values, criticalNote: text(formData, "criticalNote"), report: text(formData, "report"), resultAt: new Date(), resultById: user.id },
  });
  if (!count) return { error: "Registre a coleta antes, ou o resultado já foi liberado." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "EXAME_RESULTADO", entity: "ExamRequest", entityId: exam.id, patientId: exam.patientId, details: { exame: exam.examType.name } });
  revalidateAll();
  return { error: "", ok: "Resultado liberado." };
}

// Laudo de imagem: só médico.
export async function saveImagingReport(examId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("imagem");
  if (!isPhysician(user)) return { error: "Só médico (CRM) faz o laudo." };
  const report = text(formData, "report");
  if (!report) return { error: "Escreva o laudo." };
  const exam = await prisma.examRequest.findFirst({ where: { id: examId, clinicId: user.clinicId }, include: { examType: true } });
  if (!exam || exam.examType.sector !== "IMAGEM") return { error: "Exame não encontrado." };
  const { count } = await prisma.examRequest.updateMany({
    where: { id: exam.id, clinicId: user.clinicId, status: "COLETADO" },
    data: { status: "LAUDADO", report, criticalNote: text(formData, "criticalNote"), resultAt: new Date(), resultById: user.id },
  });
  if (!count) return { error: "Registre a realização do exame antes, ou o laudo já foi feito." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "EXAME_RESULTADO", entity: "ExamRequest", entityId: exam.id, patientId: exam.patientId, details: { exame: exam.examType.name } });
  revalidateAll();
  return { error: "", ok: "Laudo liberado." };
}

export async function cancelExam(examId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await examUser();
  const reason = text(formData, "reason");
  if (!reason) return { error: "Informe o motivo." };
  const exam = await prisma.examRequest.findFirst({ where: { id: examId, clinicId: user.clinicId }, select: { id: true, patientId: true } });
  if (!exam) return { error: "Exame não encontrado." };
  const { count } = await prisma.examRequest.updateMany({
    where: { id: exam.id, clinicId: user.clinicId, status: { in: ["SOLICITADO", "AGENDADO", "COLETADO"] } },
    data: { status: "CANCELADO", canceledAt: new Date(), canceledById: user.id, cancelReason: reason },
  });
  if (!count) return { error: "Exame já laudado ou cancelado." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "EXAME_CANCELADO", entity: "ExamRequest", entityId: exam.id, patientId: exam.patientId, details: { motivo: reason } });
  revalidateAll();
  return { error: "", ok: "Exame cancelado." };
}
