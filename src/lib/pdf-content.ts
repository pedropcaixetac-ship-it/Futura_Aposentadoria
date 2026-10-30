import type { ClinicalDocument, Encounter, Patient, User } from "@prisma/client";
import { age, formatCpf, formatDate, formatDateTime } from "./format";
import { documentTypeLabel } from "./documents";
import type { Diagnosis, TemplateField } from "./record";
import type { PdfInput, PdfSection } from "./pdf";
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

type EncounterForPdf = Encounter & { professional: User; addenda: { text: string; createdAt: Date; author: User }[] };

// Sinais vitais, campos do modelo, diagnósticos e adendos de um atendimento.
function encounterSections(encounter: EncounterForPdf): PdfSection[] {
  const fields = encounter.fields as TemplateField[];
  const content = encounter.content as Record<string, string>;
  const diagnoses = encounter.diagnoses as Diagnosis[];

  const sections: PdfSection[] = fields.map((f) => ({ title: f.label, text: content[f.key] ?? "" }));
  const vitals = vitalsSummary(encounter.vitals as Vitals | null);
  if (vitals) sections.unshift({ title: "Sinais vitais", text: vitals });
  if (diagnoses.length) {
    sections.push({ title: "Diagnósticos (CID-10)", text: diagnoses.map((d) => `${d.code} ${d.description}`).join("\n") });
  }
  for (const a of encounter.addenda) {
    const who = [displayName(a.author), councilLabel(a.author)].filter(Boolean).join(" · ");
    sections.push({ title: `Adendo em ${formatDateTime(a.createdAt)} (${who})`, text: a.text });
  }
  return sections;
}

export function encounterPdfInput(clinicName: string, encounter: EncounterForPdf & { patient: Patient }): PdfInput {
  const sections = encounterSections(encounter);

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

// Prontuário completo: resumo clínico e todos os atendimentos finalizados, do mais antigo ao mais recente.
export function recordPdfInput(
  clinicName: string,
  patient: Patient,
  encounters: (EncounterForPdf & {
    documents: ClinicalDocument[];
    signedPdf?: { signerName: string; signedAt: Date; provider: string } | null;
  })[],
  generatedBy: { name: string; jobTitle: string | null; sex: string | null },
): PdfInput {
  const sections: PdfSection[] = [
    { heading: true, title: "Resumo clínico", text: "" },
    { title: "Alergias", text: patient.allergies ?? "Não informado" },
    { title: "Medicamentos em uso", text: patient.currentMedications ?? "Não informado" },
    { title: "Antecedentes pessoais", text: patient.personalHistory ?? "Não informado" },
    { title: "Antecedentes familiares", text: patient.familyHistory ?? "Não informado" },
  ];
  for (const e of encounters) {
    const who = [displayName(e.professional), councilLabel(e.professional), e.professional.specialty].filter(Boolean).join(" · ");
    sections.push({ heading: true, title: `Atendimento de ${formatDateTime(e.startedAt)}`, text: who });
    sections.push(...encounterSections(e));
    for (const d of e.documents) {
      sections.push({ title: `${documentTypeLabel[d.type]} de ${formatDateTime(d.createdAt)}`, text: d.body });
    }
    sections.push({
      text: [
        `Finalizado em ${formatDateTime(e.finalizedAt)}. Código de integridade: ${e.contentHash ?? "—"}`,
        e.signedPdf
          ? `Assinado digitalmente${e.signedPdf.provider === "TESTE" ? " (TESTE, sem validade jurídica)" : " com certificado ICP-Brasil"} por ${e.signedPdf.signerName} em ${formatDateTime(e.signedPdf.signedAt)}.`
          : "Sem assinatura digital.",
      ].join("\n"),
      small: true,
    });
  }
  if (encounters.length === 0) sections.push({ heading: true, title: "Atendimentos", text: "Nenhum atendimento finalizado." });

  return {
    clinicName,
    title: "Prontuário do paciente",
    info: [
      ...patientLines(patient),
      `${encounters.length} atendimento${encounters.length === 1 ? "" : "s"} finalizado${encounters.length === 1 ? "" : "s"}`,
    ],
    sections,
    place: `Gerado em ${formatDateTime(new Date())} por ${displayName(generatedBy)}`,
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
