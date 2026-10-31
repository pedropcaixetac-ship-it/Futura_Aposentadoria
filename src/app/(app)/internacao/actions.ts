"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type DischargeKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { patientNameWhere } from "@/lib/patient";
import { canViewClinical } from "@/lib/permissions";
import { onlyDigits } from "@/lib/format";
import { ADMISSION_ORIGINS, dischargeKindLabel, parseBedCodes, WARD_KINDS } from "@/lib/internacao";
import { findProfessional } from "@/lib/agenda-data";

export type FormState = { error: string; ok?: string };
export type PatientOption = { id: string; name: string; phone: string | null; insurance: string | null };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

// "2026-10-31T14:30" digitado no horário de Brasília. Vazio = agora.
function brasiliaDateTime(value: string | null) {
  if (!value) return new Date();
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 3, +m[5]));
}

// O banco recusa um segundo paciente no mesmo leito ou o mesmo paciente internado duas vezes.
function isDuplicate(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

async function bedOccupied(clinicId: string, bedId: string) {
  return !!(await prisma.admission.findFirst({ where: { clinicId, bedId, dischargedAt: null }, select: { id: true } }));
}

export async function searchPatients(query: string): Promise<PatientOption[]> {
  const user = await requireUser("internacao");
  const term = query.trim();
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  return prisma.patient.findMany({
    where: {
      clinicId: user.clinicId,
      OR: [patientNameWhere(term), ...(digits.length >= 3 ? [{ cpf: { contains: digits } }, { phone: { contains: digits } }] : [])],
    },
    select: { id: true, name: true, phone: true, insurance: true },
    orderBy: { name: "asc" },
    take: 8,
  });
}

export async function admitPatient(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("internacao");

  const bedId = text(formData, "bedId");
  const bed = bedId ? await prisma.bed.findFirst({ where: { id: bedId, clinicId: user.clinicId, active: true, ward: { active: true } } }) : null;
  if (!bed) return { error: "Escolha o leito." };
  if (bed.status !== "LIVRE" || (await bedOccupied(user.clinicId, bed.id))) return { error: "Este leito não está livre. Escolha outro." };

  const attending = await findProfessional(user.clinicId, text(formData, "attendingId") ?? "");
  if (!attending) return { error: "Escolha o médico responsável." };

  const origin = text(formData, "origin");
  if (!origin || !ADMISSION_ORIGINS.includes(origin)) return { error: "Informe de onde o paciente veio." };
  const admittedAt = brasiliaDateTime(text(formData, "admittedAt"));
  if (!admittedAt || admittedAt.getTime() > Date.now() + 5 * 60_000) return { error: "Confira a data e a hora da internação." };

  let patientId = text(formData, "patientId");
  const newName = text(formData, "newPatientName");
  if (patientId) {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } });
    if (!patient) return { error: "Paciente não encontrado." };
  } else if (!newName || newName.length < 3) {
    return { error: "Busque o paciente ou informe o nome completo para o cadastro rápido." };
  }
  if (patientId && (await prisma.admission.findFirst({ where: { clinicId: user.clinicId, patientId, dischargedAt: null } }))) {
    return { error: "Este paciente já está internado. Para mudar de leito, use \"Trocar de leito\" na internação." };
  }

  const insurance = text(formData, "insurance");
  let admissionId: string;
  try {
    admissionId = await prisma.$transaction(async (tx) => {
      if (!patientId) {
        const patient = await tx.patient.create({
          data: { clinicId: user.clinicId, name: newName!, phone: onlyDigits(text(formData, "newPatientPhone")) || null, insurance, registrationComplete: false },
        });
        patientId = patient.id;
      }
      const admission = await tx.admission.create({
        data: {
          clinicId: user.clinicId,
          patientId: patientId!,
          bedId: bed.id,
          attendingId: attending.id,
          admittedById: user.id,
          admittedAt,
          origin,
          reason: text(formData, "reason"),
          cidCode: text(formData, "cidCode"),
          cidDescription: text(formData, "cidDescription"),
          insurance,
        },
      });
      await tx.bedMovement.create({
        data: { clinicId: user.clinicId, admissionId: admission.id, toBedId: bed.id, movedAt: admittedAt, movedById: user.id },
      });
      return admission.id;
    });
  } catch (e) {
    if (isDuplicate(e)) return { error: "O leito acabou de ser ocupado ou o paciente já está internado. Confira o mapa de leitos." };
    throw e;
  }

  if (newName) await audit({ clinicId: user.clinicId, userId: user.id, action: "PACIENTE_CRIADO", entity: "Patient", entityId: patientId, patientId });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "INTERNACAO_CRIADA",
    entity: "Admission",
    entityId: admissionId,
    patientId,
    details: { leito: bed.code, origem: origin },
  });
  redirect(`/internacao/${admissionId}`);
}

async function findOpenAdmission(clinicId: string, id: string) {
  return prisma.admission.findFirst({ where: { id, clinicId, dischargedAt: null }, include: { bed: true } });
}

export async function transferBed(admissionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("internacao");
  const admission = await findOpenAdmission(user.clinicId, admissionId);
  if (!admission) return { error: "Internação não encontrada ou já encerrada." };
  const bedId = text(formData, "bedId");
  const bed = bedId ? await prisma.bed.findFirst({ where: { id: bedId, clinicId: user.clinicId, active: true, ward: { active: true } } }) : null;
  if (!bed) return { error: "Escolha o novo leito." };
  if (bed.id === admission.bedId) return { error: "O paciente já está neste leito." };
  if (bed.status !== "LIVRE" || (await bedOccupied(user.clinicId, bed.id))) return { error: "Este leito não está livre. Escolha outro." };
  const note = text(formData, "note");

  try {
    await prisma.$transaction([
      prisma.admission.update({ where: { id: admission.id }, data: { bedId: bed.id } }),
      // O leito de onde o paciente saiu vai para limpeza.
      prisma.bed.update({ where: { id: admission.bedId }, data: { status: "LIMPEZA" } }),
      prisma.bedMovement.create({
        data: { clinicId: user.clinicId, admissionId: admission.id, fromBedId: admission.bedId, toBedId: bed.id, movedById: user.id, note },
      }),
    ]);
  } catch (e) {
    if (isDuplicate(e)) return { error: "O leito acabou de ser ocupado. Escolha outro." };
    throw e;
  }
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "INTERNACAO_LEITO_TROCADO",
    entity: "Admission",
    entityId: admission.id,
    patientId: admission.patientId,
    details: { de: admission.bed.code, para: bed.code, motivo: note },
  });
  revalidatePath(`/internacao/${admission.id}`);
  return { error: "", ok: `Paciente transferido para o leito ${bed.code}.` };
}

const dischargeKinds = Object.keys(dischargeKindLabel) as DischargeKind[];

export async function dischargePatient(admissionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("internacao");
  if (!canViewClinical(user)) return { error: "A alta é dada por profissional de saúde com registro em conselho." };
  const admission = await findOpenAdmission(user.clinicId, admissionId);
  if (!admission) return { error: "Internação não encontrada ou já encerrada." };
  const kind = text(formData, "dischargeKind") as DischargeKind | null;
  if (!kind || !dischargeKinds.includes(kind)) return { error: "Escolha o tipo de alta." };
  const dischargedAt = brasiliaDateTime(text(formData, "dischargedAt"));
  if (!dischargedAt || dischargedAt.getTime() > Date.now() + 5 * 60_000 || dischargedAt < admission.admittedAt) {
    return { error: "Confira a data e a hora da alta (não pode ser antes da internação nem no futuro)." };
  }
  const note = text(formData, "dischargeNote");

  await prisma.$transaction([
    prisma.admission.update({ where: { id: admission.id }, data: { dischargedAt, dischargeKind: kind, dischargeNote: note, dischargedById: user.id } }),
    prisma.bed.update({ where: { id: admission.bedId }, data: { status: "LIMPEZA" } }),
  ]);
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "INTERNACAO_ALTA",
    entity: "Admission",
    entityId: admission.id,
    patientId: admission.patientId,
    details: { tipo: dischargeKindLabel[kind], leito: admission.bed.code },
  });
  revalidatePath(`/internacao/${admission.id}`);
  return { error: "", ok: "Alta registrada. O leito foi para limpeza." };
}

// Mapa de leitos: qualquer pessoa da aba Internação libera o leito depois da limpeza.
export async function markBedClean(bedId: string) {
  const user = await requireUser("internacao");
  await prisma.bed.updateMany({ where: { id: bedId, clinicId: user.clinicId, status: "LIMPEZA" }, data: { status: "LIVRE" } });
  revalidatePath("/internacao");
}

// ---- Cadastro de alas e leitos ----

export async function saveWard(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("leitos");
  const name = text(formData, "name");
  const kind = text(formData, "kind") ?? "Enfermaria";
  if (!name) return { error: "Informe o nome da ala." };
  if (!WARD_KINDS.includes(kind)) return { error: "Escolha o tipo da ala." };
  try {
    await prisma.ward.create({ data: { clinicId: user.clinicId, name, kind } });
  } catch (e) {
    if (isDuplicate(e)) return { error: "Já existe uma ala com este nome." };
    throw e;
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LEITOS_ALTERADOS", entity: "Ward", details: { alaCriada: name } });
  revalidatePath("/internacao/leitos");
  return { error: "", ok: `Ala "${name}" cadastrada. Agora cadastre os leitos dela.` };
}

export async function addBeds(wardId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("leitos");
  const ward = await prisma.ward.findFirst({ where: { id: wardId, clinicId: user.clinicId } });
  if (!ward) return { error: "Ala não encontrada." };
  const { codes, error } = parseBedCodes(String(formData.get("codes") ?? ""));
  if (error) return { error };
  const existing = await prisma.bed.findMany({ where: { clinicId: user.clinicId, wardId, code: { in: codes } }, select: { code: true, active: true } });
  // Leito desativado com o mesmo código volta a valer.
  const inactive = existing.filter((b) => !b.active).map((b) => b.code);
  const taken = new Set(existing.map((b) => b.code));
  const fresh = codes.filter((c) => !taken.has(c));
  await prisma.$transaction([
    prisma.bed.createMany({ data: fresh.map((code) => ({ clinicId: user.clinicId, wardId, code })) }),
    prisma.bed.updateMany({ where: { clinicId: user.clinicId, wardId, code: { in: inactive } }, data: { active: true, status: "LIVRE", statusNote: null } }),
  ]);
  const added = fresh.length + inactive.length;
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LEITOS_ALTERADOS", entity: "Ward", entityId: wardId, details: { ala: ward.name, leitosIncluidos: [...fresh, ...inactive] } });
  revalidatePath("/internacao/leitos");
  const skipped = codes.length - added;
  return { error: "", ok: `${added} leito(s) incluído(s)${skipped ? `; ${skipped} já existia(m)` : ""}.` };
}

async function findVacantBed(clinicId: string, bedId: string) {
  const bed = await prisma.bed.findFirst({ where: { id: bedId, clinicId }, include: { ward: true } });
  if (!bed) throw new Error("Leito não encontrado");
  if (await bedOccupied(clinicId, bedId)) throw new Error("Leito ocupado: dê alta ou troque o paciente de leito antes.");
  return bed;
}

export async function blockBed(bedId: string, formData: FormData) {
  const user = await requireUser("leitos");
  const bed = await findVacantBed(user.clinicId, bedId);
  const reason = text(formData, "reason");
  await prisma.bed.update({ where: { id: bed.id }, data: { status: "BLOQUEADO", statusNote: reason } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LEITOS_ALTERADOS", entity: "Bed", entityId: bed.id, details: { leitoBloqueado: `${bed.ward.name} ${bed.code}`, motivo: reason } });
  revalidatePath("/internacao/leitos");
}

export async function unblockBed(bedId: string) {
  const user = await requireUser("leitos");
  const bed = await findVacantBed(user.clinicId, bedId);
  await prisma.bed.update({ where: { id: bed.id }, data: { status: "LIVRE", statusNote: null } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LEITOS_ALTERADOS", entity: "Bed", entityId: bed.id, details: { leitoDesbloqueado: `${bed.ward.name} ${bed.code}` } });
  revalidatePath("/internacao/leitos");
}

// Leito que deixou de existir sai do mapa, mas continua no histórico das internações antigas.
export async function removeBed(bedId: string) {
  const user = await requireUser("leitos");
  const bed = await findVacantBed(user.clinicId, bedId);
  await prisma.bed.update({ where: { id: bed.id }, data: { active: false } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LEITOS_ALTERADOS", entity: "Bed", entityId: bed.id, details: { leitoRemovido: `${bed.ward.name} ${bed.code}` } });
  revalidatePath("/internacao/leitos");
}
