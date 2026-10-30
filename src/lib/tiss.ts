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

export type ClaimPayment = { id: string; paidCents: number; glossReason: string | null };

// Lê o que o convênio pagou em cada guia do lote (campos pago_<id> e glosa_<id>).
// Pagar menos que o valor da guia é glosa e precisa do motivo, que serve para recorrer depois.
export function parseClaimPayments(
  get: (key: string) => string | null,
  claims: { id: string; number: number; amountCents: number }[],
  parseMoney: (value: string) => number | null,
): { payments: ClaimPayment[] } | { error: string } {
  const payments: ClaimPayment[] = [];
  for (const claim of claims) {
    const raw = (get(`pago_${claim.id}`) ?? "").trim();
    const paidCents = raw === "" || /^0+(,0+)?$/.test(raw) ? 0 : parseMoney(raw);
    const label = `Guia ${claimNumberLabel(claim.number)}`;
    if (paidCents === null) return { error: `${label}: valor pago inválido (ex.: 150,00).` };
    if (paidCents > claim.amountCents) return { error: `${label}: o valor pago é maior que o valor da guia.` };
    const glossReason = (get(`glosa_${claim.id}`) ?? "").trim().slice(0, 300) || null;
    if (paidCents < claim.amountCents && !glossReason) return { error: `${label}: informe o motivo da glosa (o que o convênio não pagou).` };
    payments.push({ id: claim.id, paidCents, glossReason: paidCents < claim.amountCents ? glossReason : null });
  }
  return { payments };
}

// Tabela 50 (tipo de atendimento) na guia SP/SADT: só os que se usam em consultório.
export const serviceTypes = [
  { value: "23", label: "Exames" },
  { value: "03", label: "Outras terapias" },
  { value: "13", label: "Pequenos atendimentos" },
  { value: "02", label: "Pequena cirurgia" },
  { value: "04", label: "Consulta" },
] as const;

// Uma guia SP/SADT leva no máximo esta quantidade de itens (o formulário mostra uma linha por item).
export const MAX_CLAIM_ITEMS = 20;

export type ClaimItemInput = { sequence: number; tussCode: string; description: string; quantity: number; unitCents: number; totalCents: number };

// Lê os itens da guia SP/SADT (campos item_tuss_N, item_qtd_N e item_valor_N). Linha sem procedimento é ignorada;
// o procedimento precisa estar na tabela do convênio, que dá a descrição.
export function parseClaimItems(
  get: (key: string) => string | null,
  prices: { tussCode: string; description: string }[],
  parseMoney: (value: string) => number | null,
  normalizeTuss: (value: string) => string | null,
): { items: ClaimItemInput[] } | { error: string } {
  const items: ClaimItemInput[] = [];
  for (let i = 0; i < MAX_CLAIM_ITEMS; i++) {
    const raw = (get(`item_tuss_${i}`) ?? "").trim();
    if (!raw) continue;
    const line = `Item ${items.length + 1}`;
    const tussCode = normalizeTuss(raw);
    const price = tussCode ? prices.find((p) => p.tussCode === tussCode) : undefined;
    if (!tussCode || !price) return { error: `${line}: procedimento fora da tabela do convênio.` };
    const quantity = Number((get(`item_qtd_${i}`) ?? "1").trim() || "1");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return { error: `${line}: quantidade inválida.` };
    const unitCents = parseMoney((get(`item_valor_${i}`) ?? "").trim());
    if (!unitCents) return { error: `${line}: valor inválido (ex.: 80,00).` };
    items.push({ sequence: items.length + 1, tussCode, description: price.description, quantity, unitCents, totalCents: unitCents * quantity });
  }
  if (items.length === 0) return { error: "Inclua ao menos um exame ou procedimento." };
  return { items };
}

export function claimKindLabel(kind: "CONSULTA" | "SPSADT") {
  return kind === "SPSADT" ? "SP/SADT" : "Consulta";
}
