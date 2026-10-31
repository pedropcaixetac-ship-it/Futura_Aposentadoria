import type { DocumentType } from "@prisma/client";
import { isLaudo, laudoSummary, type LaudoValues } from "./laudos";

export const documentTypeLabel: Record<DocumentType, string> = {
  RECEITA: "Receita",
  ATESTADO: "Atestado",
  PEDIDO_EXAME: "Pedido de exame",
  RELATORIO: "Relatório",
  APAC: "APAC",
  AIH: "AIH",
  LME: "LME",
};

export const documentTypes = Object.keys(documentTypeLabel) as DocumentType[];

// Texto inicial de cada tipo, para o profissional só completar.
export const documentDefaultBody: Record<DocumentType, string> = {
  RECEITA: "Uso oral\n\n1. ",
  ATESTADO:
    "Atesto, para os devidos fins, que o(a) paciente acima foi atendido(a) nesta data e necessita de ___ dia(s) de afastamento de suas atividades, a partir de hoje.",
  PEDIDO_EXAME: "Solicito:\n\n1. \n\nIndicação clínica: ",
  RELATORIO: "",
  // Laudos do SUS têm campos próprios (ver laudos.ts).
  APAC: "",
  AIH: "",
  LME: "",
};

// Uma linha que resume o documento nas listas.
export function documentPreview(doc: { type: DocumentType; body: string; fields: unknown }) {
  if (isLaudo(doc.type) && doc.fields) return laudoSummary(doc.type, doc.fields as LaudoValues);
  return doc.body.split("\n").find((l) => l.trim());
}
