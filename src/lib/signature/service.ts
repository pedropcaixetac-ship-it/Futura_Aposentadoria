import { createHash } from "node:crypto";
import { prisma } from "../db";
import { audit } from "../audit";
import { formatCpf, formatDateTime } from "../format";
import { documentTypeLabel } from "../documents";
import { buildPdf } from "../pdf";
import { documentPdfInput, encounterPdfInput, recordPdfInput } from "../pdf-content";
import { loadRecordForPdf } from "../prontuario";
import { canViewClinical } from "../permissions";
import type { CurrentUser } from "../auth";
import { certificateHolder, parseCertificate, type RawSigner } from "./cms";
import { signPdf } from "./pdf-sign";
import { providerLabel, signDigest, type ProviderId } from "./providers";
import { open } from "./secret-box";
import { testCertificate } from "./test-certificate";

// prontuario: cópia do prontuário completo; o id é o do paciente.
export type SignTarget = { kind: "atendimento" | "documento" | "prontuario"; id: string };

export function isSignTarget(value: unknown): value is SignTarget {
  const v = value as SignTarget;
  return !!v && (v.kind === "atendimento" || v.kind === "documento" || v.kind === "prontuario") && typeof v.id === "string";
}

// Só voltamos para telas do prontuário, nunca para um endereço de fora.
export function isSafeBack(value: unknown): value is string {
  return typeof value === "string" && /^\/pacientes\/[\w-]+(\/atendimentos\/[\w-]+(\/revisao)?)?$/.test(value);
}

// Carrega o que vai ser assinado e confere se quem pede é o autor.
async function loadTarget(user: CurrentUser, target: SignTarget) {
  if (target.kind === "prontuario") {
    // Mesmo PDF do botão "Gerar PDF do prontuário". Cada cópia assinada é nova,
    // porque o prontuário cresce a cada atendimento.
    const record = canViewClinical(user) ? await loadRecordForPdf(user.clinicId, target.id) : null;
    if (!record) throw new Error("Paciente não encontrado");
    return {
      already: false,
      patientId: record.patient.id,
      back: `/pacientes/${record.patient.id}`,
      label: `Prontuário de ${record.patient.name}`,
      link: {},
      input: recordPdfInput(user.clinic.name, record.patient, record.encounters, user),
    };
  }
  if (target.kind === "atendimento") {
    const encounter = await prisma.encounter.findFirst({
      where: { id: target.id, clinicId: user.clinicId, status: "FINALIZADO", professionalId: user.id },
      include: {
        patient: true,
        professional: true,
        signedPdf: { select: { id: true } },
        addenda: { include: { author: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!encounter) throw new Error("Só o autor pode assinar um atendimento finalizado");
    return {
      already: !!encounter.signedPdf,
      patientId: encounter.patientId,
      back: `/pacientes/${encounter.patientId}/atendimentos/${encounter.id}`,
      label: `Atendimento de ${encounter.patient.name}`,
      link: { encounterId: encounter.id },
      input: encounterPdfInput(user.clinic.name, encounter),
    };
  }
  const doc = await prisma.clinicalDocument.findFirst({
    where: { id: target.id, clinicId: user.clinicId, authorId: user.id },
    include: { patient: true, author: true, signedPdf: { select: { id: true } } },
  });
  if (!doc) throw new Error("Só o autor pode assinar este documento");
  return {
    already: !!doc.signedPdf,
    patientId: doc.patientId,
    back: `/pacientes/${doc.patientId}/atendimentos/${doc.encounterId}`,
    label: `${documentTypeLabel[doc.type]} de ${doc.patient.name}`,
    link: { documentId: doc.id },
    input: documentPdfInput(user.clinic.name, doc),
  };
}

// Devolve o certificado e a função que assina, conforme o provedor.
async function signerFor(user: CurrentUser, provider: ProviderId, label: string) {
  if (provider === "TESTE") return testCertificate(user.name, user.cpf);

  const session = await prisma.signatureSession.findUnique({ where: { userId_provider: { userId: user.id, provider } } });
  if (!session || session.expiresAt < new Date()) return null;
  const accessToken = open(session.accessToken);
  const chain = session.certificateChain.split(",").map((c) => Buffer.from(c, "base64"));
  const sign: RawSigner = (digest) => signDigest(provider, { accessToken, alias: session.certificateAlias, digest, label });
  return { chain, sign };
}

// Assina e guarda o PDF. Devolve false quando falta a autorização no app do certificado.
export async function signTarget(user: CurrentUser, target: SignTarget, provider: ProviderId) {
  const t = await loadTarget(user, target);
  if (t.already) return { signed: true, back: t.back };

  const signer = await signerFor(user, provider, t.label);
  if (!signer) return { signed: false, back: t.back };

  const holder = certificateHolder(parseCertificate(signer.chain[0]));
  const signedAt = new Date();
  const stamp = [
    provider === "TESTE"
      ? "ASSINATURA DE TESTE - SEM VALIDADE JURÍDICA"
      : "Documento assinado digitalmente com certificado ICP-Brasil",
    `Assinado por ${holder.name}${holder.cpf ? ` · CPF ${formatCpf(holder.cpf)}` : ""}`,
    `Em ${formatDateTime(signedAt)} · Certificado em nuvem ${providerLabel[provider]} · Série ${holder.serial}`,
    "Confira a assinatura em validar.iti.gov.br",
  ];
  const unsigned = await buildPdf({ ...t.input, signatureStamp: stamp });
  const pdf = await signPdf(unsigned, holder.name, signer.chain, signer.sign);

  const saved = await prisma.signedPdf.create({
    data: {
      clinicId: user.clinicId,
      patientId: t.patientId,
      ...t.link,
      signerId: user.id,
      provider,
      signerName: holder.name,
      signerCpf: holder.cpf,
      certificateSerial: holder.serial,
      pdf: new Uint8Array(pdf),
      sha256: createHash("sha256").update(pdf).digest("hex"),
      signedAt,
    },
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "DOCUMENTO_ASSINADO",
    entity: "SignedPdf",
    entityId: saved.id,
    patientId: t.patientId,
    details: { provider, target: { ...target }, certificateSerial: holder.serial },
  });
  return { signed: true, back: t.back };
}
