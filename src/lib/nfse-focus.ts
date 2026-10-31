// Emissão automática da NFS-e nacional pela Focus NFe (focusnfe.com.br).
// Tudo que depende da Focus fica neste arquivo, para que trocar de empresa no futuro mexa só aqui.
// A chave (token) fica na variável FOCUS_NFE_TOKEN. Enquanto FOCUS_NFE_AMBIENTE não for "producao",
// as notas vão para o ambiente de teste (homologação), sem valor fiscal.
import type { InvoiceIssuer } from "@prisma/client";
import { onlyDigits } from "./format";
import type { InvoiceClinic, InvoiceProfessional } from "./nfse";

export function focusConfigured() {
  return !!process.env.FOCUS_NFE_TOKEN;
}

export function focusIsProduction() {
  return process.env.FOCUS_NFE_AMBIENTE === "producao";
}

function baseUrl() {
  return focusIsProduction() ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
}

async function focus(path: string, init: RequestInit = {}) {
  const token = process.env.FOCUS_NFE_TOKEN;
  if (!token) throw new Error("Emissão automática não configurada: falta a chave FOCUS_NFE_TOKEN");
  const res = await fetch(`${baseUrl()}/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as FocusResponse };
}

export type FocusResponse = {
  status?: string;
  numero?: string;
  codigo_verificacao?: string;
  url?: string;
  url_danfse?: string;
  mensagem?: string;
  codigo?: string;
  erros?: { codigo?: string; mensagem?: string }[];
};

// Resultado da Focus traduzido para o sistema.
export type FocusResult =
  | { state: "processando" }
  | { state: "autorizada"; number: string; verificationCode: string | null; url: string | null; pdfUrl: string | null }
  | { state: "erro"; message: string };

export function readFocusResponse(httpStatus: number, body: FocusResponse): FocusResult {
  if (body.status === "autorizado") {
    return {
      state: "autorizada",
      number: String(body.numero ?? ""),
      verificationCode: body.codigo_verificacao ?? null,
      url: body.url ?? null,
      pdfUrl: body.url_danfse ?? null,
    };
  }
  if (body.status === "processando_autorizacao" || (httpStatus === 202 && !body.erros)) return { state: "processando" };
  const errors = body.erros?.map((e) => [e.codigo, e.mensagem].filter(Boolean).join(": ")).filter(Boolean) ?? [];
  const message = errors.join(" · ") || body.mensagem || `A Focus recusou o envio (código ${httpStatus}).`;
  return { state: "erro", message: message.slice(0, 1000) };
}

export type DpsInput = {
  issuer: InvoiceIssuer;
  clinic: InvoiceClinic & { taxRegime: string | null };
  professional: InvoiceProfessional;
  charge: { description: string; amountCents: number; paidAt: Date | null; patient: { name: string; cpf: string | null; email: string | null } };
  dpsNumber: number;
  now: Date;
};

// Data e hora no fuso de Brasília, no formato que a Focus pede (2026-10-31T10:00:00-03:00).
function brasiliaDateTime(date: Date) {
  const local = new Date(date.getTime() - 3 * 3600000).toISOString().slice(0, 19);
  return `${local}-03:00`;
}

// Opção pelo Simples Nacional: 1 = não optante, 2 = MEI, 3 = ME/EPP.
function simplesOption(issuer: InvoiceIssuer, taxRegime: string | null) {
  if (issuer === "PROFISSIONAL") return "1";
  if (taxRegime === "MEI") return "2";
  if (taxRegime === "Simples Nacional") return "3";
  return "1";
}

// Monta a DPS (o pedido de nota) no formato da Focus para a NFS-e nacional.
export function buildDps({ issuer, clinic, professional, charge, dpsNumber, now }: DpsInput) {
  const city = onlyDigits(clinic.cityIbgeCode);
  const provider =
    issuer === "CLINICA"
      ? { cnpj_prestador: onlyDigits(clinic.cnpj), inscricao_municipal_prestador: clinic.municipalRegistration ?? undefined }
      : { cpf_prestador: onlyDigits(professional?.cpf), inscricao_municipal_prestador: professional?.municipalRegistration ?? undefined };
  return {
    data_emissao: brasiliaDateTime(now),
    data_competencia: (charge.paidAt ?? now).toISOString().slice(0, 10),
    serie_dps: 1,
    numero_dps: dpsNumber,
    emitente_dps: 1,
    codigo_municipio_emissora: Number(city),
    ...provider,
    codigo_opcao_simples_nacional: simplesOption(issuer, clinic.taxRegime),
    // 5 = profissional autônomo; a clínica fica sem regime especial.
    regime_especial_tributacao: issuer === "PROFISSIONAL" ? "5" : "0",
    cpf_tomador: onlyDigits(charge.patient.cpf),
    razao_social_tomador: charge.patient.name.slice(0, 150),
    ...(charge.patient.email && { email_tomador: charge.patient.email.slice(0, 80) }),
    codigo_municipio_prestacao: city,
    codigo_tributacao_nacional_iss: onlyDigits(clinic.serviceCode),
    descricao_servico: charge.description.slice(0, 1000),
    valor_servico: charge.amountCents / 100,
    tributacao_iss: 1,
    tipo_retencao_iss: 1,
    finalidade_emissao: 0,
    consumidor_final: 1,
    indicador_destinatario: 0,
  };
}

export async function sendDps(ref: string, dps: ReturnType<typeof buildDps>) {
  const { status, body } = await focus(`/nfsen?ref=${encodeURIComponent(ref)}`, { method: "POST", body: JSON.stringify(dps) });
  return readFocusResponse(status, body);
}

export async function checkDps(ref: string) {
  const { status, body } = await focus(`/nfsen/${encodeURIComponent(ref)}`);
  if (status === 404) return { state: "erro", message: "A Focus não encontrou esta nota." } as FocusResult;
  return readFocusResponse(status, body);
}
