"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type EmergencyOutcome, type RiskLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canTriage } from "@/lib/hospital-roles";
import { audit } from "@/lib/audit";
import { patientNameWhere } from "@/lib/patient";
import { hasTab } from "@/lib/tabs";
import { onlyDigits } from "@/lib/format";
import { createEncounter } from "@/lib/encounter";
import { parseVitals } from "@/lib/vitals";
import { ARRIVAL_MODES, outcomeLabel, RISKS, isPhysician } from "@/lib/pronto-socorro";

export type FormState = { error: string; ok?: string };
export type PatientOption = { id: string; name: string; phone: string | null; birthDate: Date | null };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function isDuplicate(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function searchPatients(query: string): Promise<PatientOption[]> {
  const user = await requireUser("pronto-socorro");
  const term = query.trim();
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  return prisma.patient.findMany({
    where: {
      clinicId: user.clinicId,
      OR: [patientNameWhere(term), ...(digits.length >= 3 ? [{ cpf: { contains: digits } }, { phone: { contains: digits } }] : [])],
    },
    select: { id: true, name: true, phone: true, birthDate: true },
    orderBy: { name: "asc" },
    take: 8,
  });
}

// Recepção do PS: abre a ficha de chegada. Paciente sem cadastro entra só com o nome (completa depois).
export async function registerArrival(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("pronto-socorro");
  const complaint = text(formData, "complaint");
  if (!complaint) return { error: "Informe o motivo da procura (queixa principal)." };
  const arrivalMode = text(formData, "arrivalMode");
  if (arrivalMode && !ARRIVAL_MODES.includes(arrivalMode)) return { error: "Escolha como o paciente chegou." };

  let patientId = text(formData, "patientId");
  const newName = text(formData, "newPatientName");
  if (patientId) {
    if (!(await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } }))) return { error: "Paciente não encontrado." };
  } else if (!newName || newName.length < 3) {
    return { error: "Busque o paciente ou informe o nome para o cadastro rápido (pode ser \"Desconhecido\" + sinal)." };
  }

  let name = "";
  try {
    const visit = await prisma.$transaction(async (tx) => {
      if (!patientId) {
        const patient = await tx.patient.create({
          data: { clinicId: user.clinicId, name: newName!, phone: onlyDigits(text(formData, "newPatientPhone")) || null, registrationComplete: false },
        });
        patientId = patient.id;
      }
      return tx.emergencyVisit.create({
        data: { clinicId: user.clinicId, patientId: patientId!, complaint, arrivalMode, companion: text(formData, "companion"), registeredById: user.id },
        include: { patient: { select: { name: true } } },
      });
    });
    name = visit.patient.name;
    await audit({ clinicId: user.clinicId, userId: user.id, action: "PS_CHEGADA", entity: "EmergencyVisit", entityId: visit.id, patientId: visit.patientId });
  } catch (e) {
    if (isDuplicate(e)) return { error: "Este paciente já está no pronto-socorro. Veja no painel." };
    throw e;
  }
  revalidatePath("/pronto-socorro");
  return { error: "", ok: `${name} entrou na fila da triagem.` };
}

async function openVisit(clinicId: string, visitId: string) {
  return prisma.emergencyVisit.findFirst({ where: { id: visitId, clinicId, closedAt: null } });
}

// Enfermagem: classificação de risco. Pode refazer enquanto o médico ainda não chamou.
export async function triageVisit(visitId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("pronto-socorro");
  if (!canTriage(user)) return { error: "A classificação de risco é feita pelo enfermeiro ou pelo médico." };
  const visit = await openVisit(user.clinicId, visitId);
  if (!visit || (visit.status !== "AGUARDANDO_TRIAGEM" && visit.status !== "AGUARDANDO_MEDICO")) {
    return { error: "Este paciente já foi chamado pelo médico ou saiu do pronto-socorro." };
  }
  const risk = text(formData, "risk") as RiskLevel | null;
  if (!risk || !RISKS.some((r) => r.key === risk)) return { error: "Escolha a cor da classificação de risco." };
  const painRaw = text(formData, "pain");
  const pain = painRaw === null ? null : Number(painRaw);
  if (pain !== null && !(Number.isInteger(pain) && pain >= 0 && pain <= 10)) return { error: "A dor vai de 0 a 10." };

  await prisma.emergencyVisit.update({
    where: { id: visit.id },
    data: {
      status: "AGUARDANDO_MEDICO",
      risk,
      triagedAt: new Date(),
      triagedById: user.id,
      triageVitals: parseVitals(formData) ?? Prisma.DbNull,
      pain,
      triageNote: text(formData, "triageNote"),
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PS_TRIAGEM", entity: "EmergencyVisit", entityId: visit.id, patientId: visit.patientId, details: { risco: risk } });
  revalidatePath("/pronto-socorro");
  redirect("/pronto-socorro");
}

// Médico chama o paciente: abre o atendimento já com os sinais da triagem. Dois médicos não chamam o mesmo paciente.
export async function callPatient(visitId: string, formData: FormData) {
  const user = await requireUser("pronto-socorro");
  if (!isPhysician(user)) throw new Error("Só o médico chama o paciente.");
  const visit = await openVisit(user.clinicId, visitId);
  if (!visit) throw new Error("Paciente não está mais no pronto-socorro.");
  // Vermelho que chega sem triagem pode ser chamado direto.
  const { count } = await prisma.emergencyVisit.updateMany({
    where: { id: visit.id, clinicId: user.clinicId, closedAt: null, status: { in: ["AGUARDANDO_TRIAGEM", "AGUARDANDO_MEDICO"] } },
    data: { status: "EM_ATENDIMENTO", calledAt: new Date(), doctorId: user.id },
  });
  if (count === 0) redirect(`/pronto-socorro/${visit.id}?jaChamado=1`);

  const encounter = await createEncounter(user, visit.patientId, text(formData, "templateId"));
  await prisma.encounter.update({
    where: { id: encounter.id },
    data: { ...(visit.triageVitals ? { vitals: visit.triageVitals } : {}) },
  });
  await prisma.emergencyVisit.update({ where: { id: visit.id }, data: { encounterId: encounter.id } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PS_CHAMADO", entity: "EmergencyVisit", entityId: visit.id, patientId: visit.patientId });
  redirect(`/pacientes/${visit.patientId}/atendimentos/${encounter.id}`);
}

const OUTCOMES = Object.keys(outcomeLabel) as EmergencyOutcome[];

// Desfecho: alta, internação, transferência, óbito ou evasão; ou só "fica em observação" (continua aberto).
// Evasão qualquer pessoa do PS registra (o paciente foi embora); o resto é decisão do médico.
export async function closeVisit(visitId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("pronto-socorro");
  const visit = await openVisit(user.clinicId, visitId);
  if (!visit) return { error: "Este paciente já saiu do pronto-socorro." };
  const choice = text(formData, "outcome");
  const note = text(formData, "closeNote");

  if (choice === "OBSERVACAO") {
    if (!isPhysician(user)) return { error: "Só o médico coloca o paciente em observação." };
    await prisma.emergencyVisit.update({ where: { id: visit.id }, data: { status: "OBSERVACAO", ...(note && { closeNote: note }) } });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "PS_DESFECHO", entity: "EmergencyVisit", entityId: visit.id, patientId: visit.patientId, details: { desfecho: "Observação" } });
    revalidatePath("/pronto-socorro");
    return { error: "", ok: "Paciente em observação. Ele continua no painel até o desfecho." };
  }

  const outcome = choice as EmergencyOutcome | null;
  if (!outcome || !OUTCOMES.includes(outcome)) return { error: "Escolha o desfecho." };
  if (outcome !== "EVASAO" && !isPhysician(user)) return { error: "Só o médico registra alta, internação, transferência ou óbito." };
  if (outcome === "OBITO" && !note) return { error: "Informe a hora e as circunstâncias do óbito na observação." };

  await prisma.emergencyVisit.update({
    where: { id: visit.id },
    data: { status: "ENCERRADO", outcome, closedAt: new Date(), closedById: user.id, closeNote: note ?? visit.closeNote },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PS_DESFECHO", entity: "EmergencyVisit", entityId: visit.id, patientId: visit.patientId, details: { desfecho: outcomeLabel[outcome] } });
  revalidatePath("/pronto-socorro");
  // Internação: segue direto para escolher o leito, com o paciente já preenchido.
  if (outcome === "INTERNACAO" && hasTab(user, "internacao")) redirect(`/internacao/internar?paciente=${visit.patientId}&origem=ps`);
  redirect("/pronto-socorro");
}
