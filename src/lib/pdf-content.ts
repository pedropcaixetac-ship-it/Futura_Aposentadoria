import type { ClinicalDocument, Encounter, Patient, User } from "@prisma/client";
import { age, formatCpf, formatDate, formatDateTime } from "./format";
import { documentTypeLabel } from "./documents";
import type { Diagnosis, TemplateField } from "./record";
import type { PdfInput } from "./pdf";
import { vitalsSummary, type Vitals } from "./vitals";
import { displayName } from "./staff";
import type { Prontuario } from "./prontuario";

type Professional = Pick<User, "councilType" | "councilNumber" | "councilUf" | "specialty"> & Parameters<typeof displayName>[0];

function council(user: Pick<User, "councilType" | "councilNumber" | "councilUf">) {
  return user.councilNumber ? `${user.councilType} ${user.councilNumber}/${user.councilUf}` : null;
}

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
    const who = [displayName(a.author), council(a.author)].filter(Boolean).join(" · ");
    sections.push({ title: `Adendo em ${formatDateTime(a.createdAt)} (${who})`, text: a.text });
  }

  return {
    clinicName,
    // O nome do modelo usado é coisa interna da clínica; o PDF leva sempre o mesmo título.
    title: "Registro de atendimento",
    info: [...patientLines(encounter.patient), `Atendimento: ${formatDateTime(encounter.startedAt)}`],
    sections,
    professional: { name: displayName(encounter.professional), council: council(encounter.professional), specialty: encounter.professional.specialty },
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
    professional: { name: displayName(doc.author), council: council(doc.author), specialty: doc.author.specialty },
    place: `Emitido em ${formatDateTime(doc.createdAt)}`,
    integrityCode: doc.contentHash,
  };
}

// Prontuário completo: resumo clínico e, em seguida, cada atendimento finalizado.
// Quem assina (ou emite) o PDF é quem pediu a cópia, como "cópia fiel" do sistema.
export function prontuarioPdfInput(clinicName: string, { patient, encounters }: Prontuario, issuer: Professional): PdfInput {
  const summary = [
    ["Alergias", patient.allergies],
    ["Medicamentos em uso", patient.currentMedications],
    ["Antecedentes pessoais", patient.personalHistory],
    ["Antecedentes familiares", patient.familyHistory],
  ] as const;
  const sections: PdfInput["sections"] = summary.map(([title, text]) => ({ title, text: text ?? "" }));

  if (encounters.length === 0) sections.push({ text: "Nenhum atendimento finalizado." });
  for (const e of encounters) {
    const who = [displayName(e.professional), council(e.professional)].filter(Boolean).join(" · ");
    const signature = e.signedPdf
      ? `Assinado digitalmente${e.signedPdf.provider === "TESTE" ? " (TESTE, sem validade jurídica)" : " com certificado ICP-Brasil"} por ${e.signedPdf.signerName} em ${formatDateTime(e.signedPdf.signedAt)}`
      : "Sem assinatura digital";
    sections.push({
      heading: true,
      title: `Atendimento de ${formatDateTime(e.startedAt)}`,
      text: [who, `Finalizado em ${formatDateTime(e.finalizedAt)} · ${signature}`, `Código de integridade: ${e.contentHash ?? "—"}`].join("\n"),
    });
    // Reaproveita o mesmo conteúdo do PDF de cada atendimento.
    sections.push(...encounterPdfInput(clinicName, { ...e, patient }).sections);
    if (e.documents.length) {
      sections.push({
        title: "Documentos emitidos",
        text: e.documents.map((d) => `${documentTypeLabel[d.type]} · ${formatDateTime(d.createdAt)}`).join("\n"),
      });
    }
  }

  return {
    clinicName,
    title: "Prontuário do paciente",
    info: [...patientLines(patient), `${encounters.length} atendimento(s) finalizado(s)`],
    sections,
    professional: { name: displayName(issuer), council: council(issuer), specialty: issuer.specialty },
    place: `Cópia do prontuário emitida em ${formatDateTime(new Date())}`,
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
