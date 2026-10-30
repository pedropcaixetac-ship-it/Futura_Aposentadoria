// Arquivo XML do lote de guias no padrão TISS (mensagem ENVIO_LOTE_GUIAS), que o convênio recebe
// pelo portal ou por upload. Segue os schemas oficiais da ANS (cópia em tests/fixtures).
import { createHash } from "node:crypto";
import { councilCode, TUSS_TABLE, ufCode } from "./tiss";

export const TISS_VERSION = "4.03.00";
// Cada lote leva no máximo 100 guias (limite do schema).
export const MAX_CLAIMS_PER_BATCH = 100;

type Node = [name: string, content: string | Node[]];

export type BatchClaimItem = { sequence: number; tussCode: string; description: string; quantity: number; unitCents: number; totalCents: number };

export type BatchClaim = {
  kind: "CONSULTA" | "SPSADT";
  number: number;
  operatorNumber: string | null;
  cardNumber: string;
  newborn: boolean;
  careRegime: string;
  serviceDate: Date;
  consultationType: number | null;
  accidentIndication: number;
  cbo: string;
  tussCode: string;
  amountCents: number;
  notes: string | null;
  // Só na SP/SADT.
  serviceType: string | null;
  urgent: boolean;
  clinicalIndication: string | null;
  requestDate: Date | null;
  authorizationDate: Date | null;
  authorizationCode: string | null;
  items: BatchClaimItem[];
  professional: { name: string; councilType: string | null; councilNumber: string | null; councilUf: string | null };
};

export type BatchInput = {
  number: number;
  createdAt: Date;
  plan: { ansCode: string; providerCode: string | null };
  clinic: { name: string; cnpj: string | null; cnes: string };
  claims: BatchClaim[];
};

// O arquivo vai em ISO-8859-1: troca o que não existe nessa codificação (travessão, aspas curvas, emojis).
export function latin1(text: string) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\u0000-ÿ]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Data e hora de Brasília, como a ANS espera (aaaa-mm-dd e hh:mm:ss).
function brasilia(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}:${get("second")}` };
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const money = (cents: number) => (cents / 100).toFixed(2);

// Quem envia: o código da clínica no convênio ou, sem ele, o CNPJ.
function provider(input: BatchInput): Node {
  return input.plan.providerCode
    ? ["codigoPrestadorNaOperadora", input.plan.providerCode]
    : ["CNPJ", (input.clinic.cnpj ?? "").replace(/\D/g, "")];
}

// A clínica dentro da guia: o código no convênio ou, sem ele, o CNPJ.
function contracted(input: BatchInput): Node {
  return input.plan.providerCode
    ? ["codigoPrestadorNaOperadora", input.plan.providerCode]
    : ["cnpjContratado", (input.clinic.cnpj ?? "").replace(/\D/g, "")];
}

function professionalNodes(claim: BatchClaim): Node[] {
  const professional = claim.professional;
  return [
    ["nomeProfissional", latin1(professional.name).slice(0, 70)],
    ["conselhoProfissional", councilCode(professional.councilType) ?? "10"],
    ["numeroConselhoProfissional", (professional.councilNumber ?? "").slice(0, 15)],
    ["UF", ufCode(professional.councilUf) ?? ""],
    ["CBOS", claim.cbo],
  ];
}

function consultationNode(input: BatchInput, claim: BatchClaim): Node {
  return ["guiaConsulta", [
    ["cabecalhoConsulta", [["registroANS", input.plan.ansCode], ["numeroGuiaPrestador", String(claim.number)]]],
    ...(claim.operatorNumber ? [["numeroGuiaOperadora", claim.operatorNumber] as Node] : []),
    ["dadosBeneficiario", [["numeroCarteira", claim.cardNumber], ["atendimentoRN", claim.newborn ? "S" : "N"]]],
    ["contratadoExecutante", [contracted(input), ["CNES", input.clinic.cnes]]],
    ["profissionalExecutante", professionalNodes(claim)],
    ["indicacaoAcidente", String(claim.accidentIndication)],
    ["dadosAtendimento", [
      ["regimeAtendimento", claim.careRegime],
      ["dataAtendimento", isoDate(claim.serviceDate)],
      ["tipoConsulta", String(claim.consultationType ?? 1)],
      ["procedimento", [["codigoTabela", TUSS_TABLE], ["codigoProcedimento", claim.tussCode], ["valorProcedimento", money(claim.amountCents)]]],
    ]],
    ...(claim.notes ? [["observacao", latin1(claim.notes).slice(0, 500)] as Node] : []),
  ]];
}

// Guia SP/SADT: exames e procedimentos, um item por linha. Quem pede é o próprio profissional da clínica.
function sadtNode(input: BatchInput, claim: BatchClaim): Node {
  const authorization: Node[] = claim.authorizationDate
    ? [["dadosAutorizacao", [
        ...(claim.operatorNumber ? [["numeroGuiaOperadora", claim.operatorNumber] as Node] : []),
        ["dataAutorizacao", isoDate(claim.authorizationDate)],
        ...(claim.authorizationCode ? [["senha", claim.authorizationCode] as Node] : []),
      ]]]
    : [];
  const items: Node[] = claim.items.map((item) => ["procedimentoExecutado", [
    ["sequencialItem", String(item.sequence)],
    ["dataExecucao", isoDate(claim.serviceDate)],
    ["procedimento", [
      ["codigoTabela", TUSS_TABLE],
      ["codigoProcedimento", item.tussCode],
      ["descricaoProcedimento", latin1(item.description).slice(0, 150)],
    ]],
    ["quantidadeExecutada", String(item.quantity)],
    ["reducaoAcrescimo", "1.00"],
    ["valorUnitario", money(item.unitCents)],
    ["valorTotal", money(item.totalCents)],
  ]]);
  return ["guiaSP-SADT", [
    ["cabecalhoGuia", [["registroANS", input.plan.ansCode], ["numeroGuiaPrestador", String(claim.number)]]],
    ...authorization,
    ["dadosBeneficiario", [["numeroCarteira", claim.cardNumber], ["atendimentoRN", claim.newborn ? "S" : "N"]]],
    ["dadosSolicitante", [
      ["contratadoSolicitante", [contracted(input)]],
      ["nomeContratadoSolicitante", latin1(input.clinic.name).slice(0, 70)],
      ["profissionalSolicitante", professionalNodes(claim)],
    ]],
    ["dadosSolicitacao", [
      ...(claim.requestDate ? [["dataSolicitacao", isoDate(claim.requestDate)] as Node] : []),
      ["caraterAtendimento", claim.urgent ? "2" : "1"],
      ...(claim.clinicalIndication ? [["indicacaoClinica", latin1(claim.clinicalIndication).slice(0, 500)] as Node] : []),
    ]],
    ["dadosExecutante", [["contratadoExecutante", [contracted(input)]], ["CNES", input.clinic.cnes]]],
    ["dadosAtendimento", [
      ["tipoAtendimento", claim.serviceType ?? "23"],
      ["indicacaoAcidente", String(claim.accidentIndication)],
      ["regimeAtendimento", claim.careRegime],
    ]],
    ["procedimentosExecutados", items],
    ...(claim.notes ? [["observacao", latin1(claim.notes).slice(0, 500)] as Node] : []),
    ["valorTotal", [["valorProcedimentos", money(claim.amountCents)], ["valorTotalGeral", money(claim.amountCents)]]],
  ]];
}

function claimNode(input: BatchInput, claim: BatchClaim): Node {
  return claim.kind === "SPSADT" ? sadtNode(input, claim) : consultationNode(input, claim);
}

function render(node: Node, leaves: string[], indent = ""): string {
  const [name, content] = node;
  if (typeof content === "string") {
    leaves.push(content);
    return `${indent}<ans:${name}>${escape(content)}</ans:${name}>\n`;
  }
  return `${indent}<ans:${name}>\n${content.map((child) => render(child, leaves, `${indent}  `)).join("")}${indent}</ans:${name}>\n`;
}

// Monta o XML e o "hash" do epílogo: MD5 do texto de todos os campos, na ordem, em ISO-8859-1.
// O convênio recalcula esse hash para saber que o arquivo não foi alterado no caminho.
export function buildBatchXml(input: BatchInput) {
  const when = brasilia(input.createdAt);
  const body: Node[] = [
    ["cabecalho", [
      ["identificacaoTransacao", [
        ["tipoTransacao", "ENVIO_LOTE_GUIAS"],
        ["sequencialTransacao", String(input.number)],
        ["dataRegistroTransacao", when.date],
        ["horaRegistroTransacao", when.time],
      ]],
      ["origem", [["identificacaoPrestador", [provider(input)]]]],
      ["destino", [["registroANS", input.plan.ansCode]]],
      ["Padrao", TISS_VERSION],
    ]],
    ["prestadorParaOperadora", [
      ["loteGuias", [
        ["numeroLote", String(input.number)],
        ["guiasTISS", input.claims.map((claim) => claimNode(input, claim))],
      ]],
    ]],
  ];
  const leaves: string[] = [];
  const inner = body.map((node) => render(node, leaves, "  ")).join("");
  const hash = createHash("md5").update(Buffer.from(leaves.join(""), "latin1")).digest("hex");
  const xml =
    `<?xml version="1.0" encoding="ISO-8859-1"?>\n` +
    `<ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">\n` +
    inner +
    `  <ans:epilogo>\n    <ans:hash>${hash}</ans:hash>\n  </ans:epilogo>\n` +
    `</ans:mensagemTISS>\n`;
  return { xml, hash };
}

// Nome do arquivo como a maioria dos portais aceita: número do lote + hash.
export function batchFileName(number: number, hash: string) {
  return `${String(number).padStart(20, "0")}_${hash}.xml`;
}
