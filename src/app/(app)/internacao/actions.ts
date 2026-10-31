"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type DischargeKind, type EvolutionKind, type FluidDirection, type Shift } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAdmit, canDischarge, isDoctor } from "@/lib/hospital-roles";
import { audit } from "@/lib/audit";
import { patientNameWhere } from "@/lib/patient";
import { canViewClinical, canWorkClinical } from "@/lib/permissions";
import { onlyDigits } from "@/lib/format";
import { ADMISSION_ORIGINS, dischargeKindLabel, evolutionKindLabel, FLUID_IN, FLUID_OUT, parseBedCodes, shiftLabel, WARD_KINDS } from "@/lib/internacao";
import { createEncounter } from "@/lib/encounter";
import { parseVitals } from "@/lib/vitals";
import { withLock, type Tx } from "@/lib/lock";

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

async function bedOccupied(clinicId: string, bedId: string, tx?: Tx) {
  const found = tx
    ? await tx.admission.findFirst({ where: { clinicId, bedId, dischargedAt: null }, select: { id: true } })
    : await prisma.admission.findFirst({ where: { clinicId, bedId, dischargedAt: null }, select: { id: true } });
  return !!found;
}

// O leito ainda está livre e em uso? Conferido de novo dentro da trava, porque alguém pode ter
// bloqueado, removido ou ocupado o leito entre a tela abrir e o clique.
async function bedStillFree(tx: Tx, clinicId: string, bedId: string) {
  const bed = await tx.bed.findFirst({ where: { id: bedId, clinicId, active: true, status: "LIVRE", ward: { active: true } }, select: { id: true } });
  return !!bed && !(await bedOccupied(clinicId, bedId, tx));
}

// Trava de um leito e de uma internação: internar, trocar de leito, dar alta e bloquear passam uma de cada vez.
const bedKey = (bedId: string) => `leito:${bedId}`;
const admissionKey = (admissionId: string) => `internacao:${admissionId}`;

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
  if (!canAdmit(user)) return { error: "A internação é feita pelo setor de internação, pela enfermagem ou pelo médico." };

  const bedId = text(formData, "bedId");
  const bed = bedId ? await prisma.bed.findFirst({ where: { id: bedId, clinicId: user.clinicId, active: true, ward: { active: true } } }) : null;
  if (!bed) return { error: "Escolha o leito." };
  if (bed.status !== "LIVRE" || (await bedOccupied(user.clinicId, bed.id))) return { error: "Este leito não está livre. Escolha outro." };

  const attending = await prisma.user.findFirst({
    where: { id: text(formData, "attendingId") ?? "", clinicId: user.clinicId, active: true },
    select: { id: true, role: true, councilType: true, councilNumber: true, specialty: true },
  });
  if (!attending || !isDoctor(attending)) return { error: "Escolha o médico responsável (CRM)." };

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
  let admissionId: string | null;
  try {
    admissionId = await withLock([bedKey(bed.id)], async (tx) => {
      if (!(await bedStillFree(tx, user.clinicId, bed.id))) return null;
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
          specialty: attending.specialty?.trim() || null,
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
  if (!admissionId) return { error: "Este leito acabou de ser ocupado, bloqueado ou removido. Escolha outro." };

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
    const moved = await withLock([admissionKey(admission.id), bedKey(bed.id)], async (tx) => {
      // Relido dentro da trava: outra pessoa pode ter acabado de trocar o leito ou dado alta.
      const fresh = await tx.admission.findFirst({ where: { id: admission.id, clinicId: user.clinicId, dischargedAt: null }, select: { bedId: true } });
      if (!fresh) return "Este paciente acabou de receber alta.";
      if (fresh.bedId === bed.id) return "O paciente já está neste leito.";
      if (fresh.bedId !== admission.bedId) return "Outra pessoa acabou de trocar este paciente de leito. Recarregue a página.";
      if (!(await bedStillFree(tx, user.clinicId, bed.id))) return "Este leito acabou de ser ocupado ou bloqueado. Escolha outro.";
      await tx.admission.update({ where: { id: admission.id }, data: { bedId: bed.id } });
      // O leito de onde o paciente saiu vai para limpeza.
      await tx.bed.update({ where: { id: fresh.bedId }, data: { status: "LIMPEZA" } });
      await tx.bedMovement.create({
        data: { clinicId: user.clinicId, admissionId: admission.id, fromBedId: fresh.bedId, toBedId: bed.id, movedById: user.id, note },
      });
      return null;
    });
    if (moved) return { error: moved };
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
  if (!canDischarge(user)) return { error: "A alta é dada pelo médico (CRM)." };
  const admission = await findOpenAdmission(user.clinicId, admissionId);
  if (!admission) return { error: "Internação não encontrada ou já encerrada." };
  const kind = text(formData, "dischargeKind") as DischargeKind | null;
  if (!kind || !dischargeKinds.includes(kind)) return { error: "Escolha o tipo de alta." };
  const dischargedAt = brasiliaDateTime(text(formData, "dischargedAt"));
  if (!dischargedAt || dischargedAt.getTime() > Date.now() + 5 * 60_000 || dischargedAt < admission.admittedAt) {
    return { error: "Confira a data e a hora da alta (não pode ser antes da internação nem no futuro)." };
  }
  const note = text(formData, "dischargeNote");

  // Uma alta só: dois médicos clicando juntos (ou alta e troca de leito no mesmo segundo) não registram duas.
  const bedCode = await withLock([admissionKey(admission.id)], async (tx) => {
    const fresh = await tx.admission.findFirst({ where: { id: admission.id, clinicId: user.clinicId, dischargedAt: null }, include: { bed: true } });
    if (!fresh) return null;
    await tx.admission.update({ where: { id: fresh.id }, data: { dischargedAt, dischargeKind: kind, dischargeNote: note, dischargedById: user.id } });
    await tx.bed.update({ where: { id: fresh.bedId }, data: { status: "LIMPEZA" } });
    return fresh.bed.code;
  });
  if (!bedCode) return { error: "Este paciente acabou de receber alta por outra pessoa." };
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "INTERNACAO_ALTA",
    entity: "Admission",
    entityId: admission.id,
    patientId: admission.patientId,
    details: { tipo: dischargeKindLabel[kind], leito: bedCode },
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

// Mexe num leito vazio (bloquear, desbloquear, remover), conferindo dentro da trava que ninguém acabou de internar nele.
async function changeVacantBed(clinicId: string, bedId: string, data: Prisma.BedUpdateInput) {
  return withLock([bedKey(bedId)], async (tx) => {
    const bed = await tx.bed.findFirst({ where: { id: bedId, clinicId }, include: { ward: true } });
    if (!bed) throw new Error("Leito não encontrado");
    if (await bedOccupied(clinicId, bedId, tx)) throw new Error("Leito ocupado: dê alta ou troque o paciente de leito antes.");
    await tx.bed.update({ where: { id: bed.id }, data });
    return bed;
  });
}

export async function blockBed(bedId: string, formData: FormData) {
  const user = await requireUser("leitos");
  const reason = text(formData, "reason");
  const bed = await changeVacantBed(user.clinicId, bedId, { status: "BLOQUEADO", statusNote: reason });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LEITOS_ALTERADOS", entity: "Bed", entityId: bed.id, details: { leitoBloqueado: `${bed.ward.name} ${bed.code}`, motivo: reason } });
  revalidatePath("/internacao/leitos");
}

export async function unblockBed(bedId: string) {
  const user = await requireUser("leitos");
  const bed = await changeVacantBed(user.clinicId, bedId, { status: "LIVRE", statusNote: null });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LEITOS_ALTERADOS", entity: "Bed", entityId: bed.id, details: { leitoDesbloqueado: `${bed.ward.name} ${bed.code}` } });
  revalidatePath("/internacao/leitos");
}

// Leito que deixou de existir sai do mapa, mas continua no histórico das internações antigas.
export async function removeBed(bedId: string) {
  const user = await requireUser("leitos");
  const bed = await changeVacantBed(user.clinicId, bedId, { active: false });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LEITOS_ALTERADOS", entity: "Bed", entityId: bed.id, details: { leitoRemovido: `${bed.ward.name} ${bed.code}` } });
  revalidatePath("/internacao/leitos");
}

// ---- Evolução, sinais vitais e balanço hídrico ----

// Profissional de saúde numa internação aberta (evolução, sinais e balanço só enquanto o paciente está internado).
async function openAdmissionForCare(admissionId: string) {
  const user = await requireUser("internacao");
  if (!canWorkClinical(user)) throw new Error("Só profissionais de saúde registram no prontuário da internação.");
  const admission = await prisma.admission.findFirst({ where: { id: admissionId, clinicId: user.clinicId, dischargedAt: null } });
  if (!admission) throw new Error("Internação não encontrada ou já encerrada.");
  return { user, admission };
}

const evolutionKinds = Object.keys(evolutionKindLabel) as EvolutionKind[];
const shifts = Object.keys(shiftLabel) as Shift[];

export async function startEvolution(admissionId: string, formData: FormData) {
  const { user, admission } = await openAdmissionForCare(admissionId);
  const kind = text(formData, "evolutionKind") as EvolutionKind | null;
  if (!kind || !evolutionKinds.includes(kind)) throw new Error("Escolha o tipo de evolução.");
  const shift = text(formData, "shift") as Shift | null;
  const encounter = await createEncounter(user, admission.patientId, text(formData, "templateId"), {
    admissionId: admission.id,
    evolutionKind: kind,
    shift: shift && shifts.includes(shift) ? shift : null,
  });
  redirect(`/pacientes/${admission.patientId}/atendimentos/${encounter.id}`);
}

// "2026-10-31T14:30" no horário de Brasília; vazio = agora. Não aceita hora no futuro nem antes da internação.
function careTime(value: string | null, admittedAt: Date) {
  const at = brasiliaDateTime(value);
  if (!at || at.getTime() > Date.now() + 5 * 60_000 || at < admittedAt) return null;
  return at;
}

export async function addVitals(admissionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { user, admission } = await openAdmissionForCare(admissionId);
  const takenAt = careTime(text(formData, "takenAt"), admission.admittedAt);
  if (!takenAt) return { error: "Confira a data e a hora da aferição." };
  const vitals = parseVitals(formData);
  const painRaw = text(formData, "pain");
  const pain = painRaw === null ? null : Number(painRaw);
  if (pain !== null && !(Number.isInteger(pain) && pain >= 0 && pain <= 10)) return { error: "A dor vai de 0 a 10." };
  if (!vitals && pain === null) return { error: "Preencha ao menos um sinal vital (valores fora do possível são descartados)." };
  await prisma.vitalRecord.create({
    data: { clinicId: user.clinicId, admissionId: admission.id, takenAt, vitals: vitals ?? {}, pain, note: text(formData, "note"), recordedById: user.id },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "SINAIS_VITAIS_REGISTRADOS", entity: "Admission", entityId: admission.id, patientId: admission.patientId });
  revalidatePath(`/internacao/${admission.id}/sinais`);
  return { error: "", ok: "Sinais vitais registrados." };
}

export async function addFluid(admissionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { user, admission } = await openAdmissionForCare(admissionId);
  const at = careTime(text(formData, "at"), admission.admittedAt);
  if (!at) return { error: "Confira a data e a hora." };
  const direction = text(formData, "direction") as FluidDirection | null;
  const kind = text(formData, "kind");
  const options = direction === "ENTRADA" ? FLUID_IN : direction === "SAIDA" ? FLUID_OUT : [];
  if (!kind || !options.includes(kind)) return { error: "Escolha o que entrou ou saiu." };
  const volumeMl = Number(text(formData, "volumeMl"));
  if (!Number.isInteger(volumeMl) || volumeMl <= 0 || volumeMl > 10000) return { error: "Informe o volume em mL (de 1 a 10.000)." };
  await prisma.fluidEntry.create({
    data: { clinicId: user.clinicId, admissionId: admission.id, at, direction: direction!, kind, volumeMl, note: text(formData, "note"), recordedById: user.id },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "BALANCO_HIDRICO_REGISTRADO", entity: "Admission", entityId: admission.id, patientId: admission.patientId });
  revalidatePath(`/internacao/${admission.id}/balanco`);
  return { error: "", ok: `${direction === "ENTRADA" ? "Entrada" : "Saída"} de ${volumeMl} mL registrada.` };
}

// Lançamento errado: fica no prontuário riscado, com quem anulou e o motivo. Só quem lançou ou quem tem acesso completo.
export async function cancelCareRecord(kind: "sinais" | "balanco", recordId: string, formData: FormData) {
  const user = await requireUser("internacao");
  if (!canWorkClinical(user)) throw new Error("Sem permissão");
  const reason = text(formData, "reason");
  if (!reason) throw new Error("Informe o motivo da anulação.");
  const record =
    kind === "sinais"
      ? await prisma.vitalRecord.findFirst({ where: { id: recordId, clinicId: user.clinicId, canceledAt: null } })
      : await prisma.fluidEntry.findFirst({ where: { id: recordId, clinicId: user.clinicId, canceledAt: null } });
  if (!record) return;
  if (record.recordedById !== user.id && !canViewClinical(user)) throw new Error("Só quem lançou pode anular.");
  const data = { canceledAt: new Date(), canceledById: user.id, cancelReason: reason };
  if (kind === "sinais") await prisma.vitalRecord.update({ where: { id: record.id }, data });
  else await prisma.fluidEntry.update({ where: { id: record.id }, data });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "REGISTRO_INTERNACAO_ANULADO", entity: kind === "sinais" ? "VitalRecord" : "FluidEntry", entityId: record.id, details: { motivo: reason } });
  revalidatePath(`/internacao/${record.admissionId}/${kind}`);
}
