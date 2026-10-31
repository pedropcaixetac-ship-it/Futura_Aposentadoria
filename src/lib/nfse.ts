import type { InvoiceIssuer, ServiceInvoiceStatus } from "@prisma/client";
import { formatCpf, onlyDigits } from "./format";

// Nota fiscal de serviço (NFS-e) das consultas particulares.
// A nota só é feita quando o paciente pede. Quem emite é escolhido pela clínica: ela mesma (CNPJ)
// ou cada profissional, como autônomo (CPF). Por enquanto a emissão é feita no emissor nacional
// (www.nfse.gov.br) e o número é anotado aqui; os dados abaixo são os que o emissor pede, e serão
// os mesmos enviados a um provedor quando a emissão automática for ligada.

export const issuerLabel: Record<InvoiceIssuer, string> = {
  CLINICA: "A clínica (pelo CNPJ)",
  PROFISSIONAL: "Cada profissional (pelo CPF, como autônomo)",
};

export const invoiceStatusLabel: Record<ServiceInvoiceStatus, string> = {
  PEDIDA: "Pedida",
  EMITIDA: "Emitida",
  CANCELADA: "Cancelada",
};

export const NFSE_EMISSOR_URL = "https://www.nfse.gov.br/EmissorNacional";

export type InvoiceClinic = {
  name: string;
  cnpj: string | null;
  municipalRegistration: string | null;
  cityIbgeCode: string | null;
  serviceCode: string | null;
  issRateBasisPoints: number | null;
};

export type InvoiceProfessional = { name: string; cpf: string | null; municipalRegistration: string | null } | null;

export type InvoiceCharge = {
  description: string;
  amountCents: number;
  paidAt: Date | null;
  patient: { name: string; cpf: string | null; guardianName?: string | null };
};

function formatCnpj(cnpj: string | null) {
  const d = onlyDigits(cnpj);
  return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : cnpj ?? "";
}

// O que falta no cadastro para a nota poder ser emitida. Lista vazia: está tudo certo.
export function invoiceMissing(issuer: InvoiceIssuer, clinic: InvoiceClinic, professional: InvoiceProfessional, charge: InvoiceCharge) {
  const missing: string[] = [];
  if (issuer === "CLINICA") {
    if (onlyDigits(clinic.cnpj).length !== 14) missing.push("CNPJ da clínica");
    if (!clinic.municipalRegistration) missing.push("inscrição municipal da clínica");
  } else if (!professional) {
    missing.push("profissional que atendeu (a cobrança está sem profissional)");
  } else {
    if (onlyDigits(professional.cpf).length !== 11) missing.push(`CPF de ${professional.name}`);
    if (!professional.municipalRegistration) missing.push(`inscrição municipal de ${professional.name}`);
  }
  if (!clinic.serviceCode) missing.push("código do serviço (Financeiro › Notas fiscais)");
  if (!clinic.cityIbgeCode) missing.push("cidade do serviço (Financeiro › Notas fiscais)");
  if (onlyDigits(charge.patient.cpf).length !== 11) missing.push(`CPF do paciente ${charge.patient.name}`);
  return missing;
}

// Os campos da nota, na ordem em que aparecem no emissor nacional, prontos para copiar.
export function invoiceFields(issuer: InvoiceIssuer, clinic: InvoiceClinic, professional: InvoiceProfessional, charge: InvoiceCharge) {
  const provider =
    issuer === "CLINICA"
      ? { name: clinic.name, document: formatCnpj(clinic.cnpj), registration: clinic.municipalRegistration }
      : { name: professional?.name ?? "", document: formatCpf(professional?.cpf), registration: professional?.municipalRegistration ?? null };
  const iss = clinic.issRateBasisPoints != null ? Math.round((charge.amountCents * clinic.issRateBasisPoints) / 10000) : null;
  return {
    provider,
    customer: { name: charge.patient.name, document: formatCpf(charge.patient.cpf) },
    serviceCode: clinic.serviceCode ?? "",
    cityIbgeCode: clinic.cityIbgeCode ?? "",
    description: charge.description,
    amountCents: charge.amountCents,
    issRate: clinic.issRateBasisPoints != null ? `${(clinic.issRateBasisPoints / 100).toLocaleString("pt-BR")}%` : "",
    issCents: iss,
    date: charge.paidAt,
  };
}

// Lê a alíquota digitada ("2", "2,5", "5%") e devolve em centésimos de % (2,5% = 250).
// ISS fica entre 2% e 5% pela lei; fora disso é erro de digitação.
export function parseIssRate(input: string): number | null | "invalid" {
  const value = input.replace("%", "").trim().replace(",", ".");
  if (!value) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return "invalid";
  const bp = Math.round(Number(value) * 100);
  return bp >= 200 && bp <= 500 ? bp : "invalid";
}
