// Tabelas e regras do padrão TISS (ANS) usadas nas guias de convênio.
// Os códigos seguem as tabelas de domínio da TISS; conferir na versão vigente ao mudar algo.

// Tabela 26 (conselho profissional), como na versão 4.03.00.
const COUNCIL_CODES: Record<string, string> = {
  CRESS: "01",
  COREN: "02",
  CRF: "03",
  CRFA: "04",
  CREFITO: "05",
  CRM: "06",
  CRN: "07",
  CRO: "08",
  CRP: "09",
  CRBIO: "11",
  CRBM: "12",
  CREF: "13",
  CRMV: "14",
  CRTR: "15",
};

export function councilCode(councilType: string | null | undefined) {
  if (!councilType) return null;
  return COUNCIL_CODES[councilType.toUpperCase()] ?? "10"; // 10 = outros conselhos
}

// Tabela 59 (UF): código do estado no IBGE.
const UF_CODES: Record<string, string> = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29",
  MG: "31", ES: "32", RJ: "33", SP: "35", PR: "41", SC: "42", RS: "43",
  MS: "50", MT: "51", GO: "52", DF: "53",
};

export function ufCode(uf: string | null | undefined) {
  return uf ? (UF_CODES[uf.toUpperCase()] ?? null) : null;
}

// Regime de atendimento: 01 ambulatorial (consultório) e 05 telessaúde (teleconsulta).
export function careRegime(teleconsultation: boolean) {
  return teleconsultation ? "05" : "01";
}

// Tabela 52 (tipo de consulta).
export const consultationTypes = [
  { value: 1, label: "Primeira consulta" },
  { value: 2, label: "Seguimento (retorno)" },
  { value: 3, label: "Pré-natal" },
  { value: 4, label: "Por encaminhamento" },
] as const;

// Tabela 36 (indicação de acidente).
export const accidentIndications = [
  { value: 9, label: "Não foi acidente" },
  { value: 0, label: "Acidente de trabalho" },
  { value: 1, label: "Acidente de trânsito" },
  { value: 2, label: "Outro tipo de acidente" },
] as const;

// Tabela 87 (tabela de referência do procedimento): 22 = procedimentos e eventos em saúde (TUSS).
export const TUSS_TABLE = "22";

// Sugestões de CBO (ocupação do profissional) mais comuns em consultório.
export const cboSuggestions = [
  { code: "225125", label: "Médico clínico" },
  { code: "225124", label: "Médico pediatra" },
  { code: "225250", label: "Médico ginecologista e obstetra" },
  { code: "225120", label: "Médico cardiologista" },
  { code: "225133", label: "Médico psiquiatra" },
  { code: "251510", label: "Psicólogo clínico" },
  { code: "223710", label: "Nutricionista" },
  { code: "223605", label: "Fisioterapeuta geral" },
];

export function normalizeCbo(value: string | null | undefined) {
  const code = (value ?? "").replace(/\D/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

// Retorno marcado na agenda vira "seguimento"; o resto, primeira consulta.
export function defaultConsultationType(appointmentType: string | null | undefined) {
  return appointmentType === "RETORNO" ? 2 : 1;
}

type ClaimContext = {
  clinic: { cnes: string | null; cnpj: string | null };
  plan: { ansCode: string | null; providerCode: string | null };
  professional: { councilType: string | null; councilNumber: string | null; councilUf: string | null };
};

// O que falta no cadastro para a guia ser aceita pelo convênio. Cada item diz onde corrigir.
export function missingForClaim({ clinic, plan, professional }: ClaimContext): string[] {
  const missing: string[] = [];
  if (!plan.ansCode) missing.push("Registro ANS do convênio (Financeiro > Convênios)");
  if (!plan.providerCode && !clinic.cnpj) missing.push("Código da clínica no convênio ou CNPJ da clínica (Financeiro > Convênios)");
  if (!clinic.cnes) missing.push("CNES da clínica (Financeiro > Convênios)");
  if (!professional.councilNumber || !professional.councilType || !ufCode(professional.councilUf)) {
    missing.push("Conselho, número e UF do profissional (Cadastro de servidores)");
  }
  return missing;
}

// Número da guia como aparece impresso: 8 dígitos com zeros à esquerda.
export function claimNumberLabel(number: number) {
  return String(number).padStart(8, "0");
}
