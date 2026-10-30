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
