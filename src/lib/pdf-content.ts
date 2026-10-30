import type { ClinicalDocument, Encounter, Patient, User } from "@prisma/client";
import { age, formatCpf, formatDate, formatDateTime } from "./format";
import { documentTypeLabel } from "./documents";
import type { Diagnosis, TemplateField } from "./record";
import type { PdfInput } from "./pdf";
import { vitalsSummary, type Vitals } from "./vitals";
import { displayName, councilLabel } from "./staff";

function patientLines(patient: Patient) {
  const years = age(patient.birthDate);
  const name = patient.socialName ? `${patient.socialName} (${patient.name})` : patient.name;
  const lines = [`Paciente: ${name}`];
  const extra = [
    patient.birthDate && `Nascimento: ${formatDate(patient.birthDate)}${years !== null ? ` (${years} anos)` : ""}`,
    patient.cpf && `CPF: ${formatCpf(patient.cpf)}`,
  ].filter(Boolean);
  if (extra.length) lines.push(extra.join(" · "));
  return lines;
}

export function encounterPdfInput(
  clinicName: string,
  encounter: Encounter & { patient: Patient; professional: User; addenda: { text: string; createdAt: Date; author: User }[] },
): PdfInput {
  const fields = encounter.fields as TemplateField[];
  const content = encounter.content as Record<string, string>;
  const diagnoses = encounter.diagnoses as Diagnosis[];

  const sections = fields.map((f) => ({ title: f.label, text: content[f.key] ?? "" }));
  const vitals = vitalsSummary(encounter.vitals as Vitals | null);
  if (vitals) sections.unshift({ title: "Sinais vitais", text: vitals });
  if (diagnoses.length) {
    sections.push({ title: "Diagnósticos (CID-10)", text: diagnoses.map((d) => `${d.code} ${d.description}`).join("\n") });
  }
  for (const a of encounter.addenda) {
    const who = [displayName(a.author), councilLabel(a.author)].filter(Boolean).join(" · ");
    sections.push({ title: `Adendo em ${formatDateTime(a.createdAt)} (${who})`, text: a.text });
  }

  return {
    clinicName,
    // O nome do modelo usado é coisa interna da clínica; o PDF leva sempre o mesmo título.
    title: "Registro de atendimento",
    info: [...patientLines(encounter.patient), `Atendimento: ${formatDateTime(encounter.startedAt)}`],
    sections,
    professional: { name: displayName(encounter.professional), council: councilLabel(encounter.professional), specialty: encounter.professional.specialty },
    place: encounter.finalizedAt ? `Finalizado em ${formatDateTime(encounter.finalizedAt)}` : "Rascunho (não finalizado)",
    integrityCode: encounter.contentHash,
  };
}

export function documentPdfInput(clinicName: string, doc: ClinicalDocument & { patient: Patient; author: User }): PdfInput {
  return {
    clinicName,
    title: documentTypeLabel[doc.type],
    info: patientLines(doc.patient),
    sections: [{ text: doc.body }],
    professional: { name: displayName(doc.author), council: councilLabel(doc.author), specialty: doc.author.specialty },
    place: `Emitido em ${formatDateTime(doc.createdAt)}`,
    integrityCode: doc.contentHash,
  };
}

// Nome do arquivo baixado, sem acentos nem espaços.
export function pdfFileName(kind: string, patientName: string, date: Date) {
  const slug = `${kind}-${patientName}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}-${date.toISOString().slice(0, 10)}.pdf`;
}
