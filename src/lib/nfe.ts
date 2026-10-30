// Leitura do arquivo XML da nota fiscal eletrônica (NF-e), que o fornecedor envia junto com o PDF (DANFE).
// Preenche sozinho fornecedor, número, itens (com lote e validade), total e parcelas.
// Funciona no navegador e no servidor (não depende de bibliotecas de XML).

export type NfeItem = {
  description: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  batch: string;
  expiresAt: string;
};

export type Nfe = {
  supplierName: string;
  supplierCnpj: string;
  invoiceNumber: string;
  invoiceSeries: string;
  accessKey: string;
  issueDate: string;
  totalCents: number;
  items: NfeItem[];
  installments: { dueDate: string; amountCents: number }[];
};

function unescape(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

// Primeiro bloco <nome>...</nome> (aceita prefixo de namespace, ex.: <nfe:nNF>).
function block(xml: string, name: string) {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`));
  return match ? match[1] : "";
}

function blocks(xml: string, name: string) {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "g"))].map((m) => m[1]);
}

function tag(xml: string, name: string) {
  return unescape(block(xml, name));
}

function cents(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function parseNfe(xml: string): Nfe | null {
  const inf = block(xml, "infNFe");
  if (!inf) return null;
  const ide = block(inf, "ide");
  const emit = block(inf, "emit");

  const id = xml.match(/<(?:\w+:)?infNFe[^>]*\sId="NFe(\d{44})"/);
  const issued = tag(ide, "dhEmi") || tag(ide, "dEmi");

  const items = blocks(inf, "det").map((det) => {
    const prod = block(det, "prod");
    // Lote e validade ficam em <rastro> (NF-e 4.0) ou em <med> (versões antigas).
    return {
      description: tag(prod, "xProd"),
      unit: tag(prod, "uCom"),
      quantity: Number(tag(prod, "qCom")) || 0,
      unitPriceCents: cents(tag(prod, "vUnCom")),
      totalCents: cents(tag(prod, "vProd")),
      batch: tag(prod, "nLote"),
      expiresAt: tag(prod, "dVal").slice(0, 10),
    };
  });

  const installments = blocks(block(inf, "cobr"), "dup").map((dup) => ({
    dueDate: tag(dup, "dVenc").slice(0, 10),
    amountCents: cents(tag(dup, "vDup")),
  }));

  return {
    supplierName: tag(emit, "xNome"),
    supplierCnpj: tag(emit, "CNPJ") || tag(emit, "CPF"),
    invoiceNumber: tag(ide, "nNF"),
    invoiceSeries: tag(ide, "serie"),
    accessKey: id ? id[1] : tag(xml, "chNFe"),
    issueDate: issued.slice(0, 10),
    totalCents: cents(tag(block(inf, "ICMSTot"), "vNF")) || items.reduce((t, i) => t + i.totalCents, 0),
    items,
    installments,
  };
}

// O que dá para saber só pela chave de acesso (44 números, também impressa no código de barras do DANFE).
// Itens e valores não estão na chave: esses só vêm pelo XML.
export type AccessKeyInfo = { cnpj: string; series: string; number: string; issueMonth: string; model: string };

const ufCodes = new Set([11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 35, 41, 42, 43, 50, 51, 52, 53]);

// Último número da chave: conta de verificação (módulo 11) que pega erro de digitação ou leitura.
export function accessKeyCheckDigit(first43: string) {
  let sum = 0;
  let weight = 2;
  for (let i = first43.length - 1; i >= 0; i--) {
    sum += Number(first43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const dv = 11 - (sum % 11);
  return dv >= 10 ? 0 : dv;
}

export function parseAccessKey(input: string): AccessKeyInfo | null {
  const key = input.replace(/\D/g, "");
  if (key.length !== 44 || !ufCodes.has(Number(key.slice(0, 2)))) return null;
  if (accessKeyCheckDigit(key.slice(0, 43)) !== Number(key[43])) return null;
  const month = Number(key.slice(4, 6));
  if (month < 1 || month > 12) return null;
  return {
    issueMonth: `20${key.slice(2, 4)}-${key.slice(4, 6)}`,
    cnpj: key.slice(6, 20),
    model: key.slice(20, 22),
    series: String(Number(key.slice(22, 25))),
    number: String(Number(key.slice(25, 34))),
  };
}
