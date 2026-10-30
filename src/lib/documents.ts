import type { DocumentType } from "@prisma/client";

export const documentTypeLabel: Record<DocumentType, string> = {
  RECEITA: "Receita",
  ATESTADO: "Atestado",
  PEDIDO_EXAME: "Pedido de exame",
  RELATORIO: "Relatório",
};

export const documentTypes = Object.keys(documentTypeLabel) as DocumentType[];

// Texto inicial de cada tipo, para o profissional só completar.
export const documentDefaultBody: Record<DocumentType, string> = {
  RECEITA: "Uso oral\n\n1. ",
  ATESTADO:
    "Atesto, para os devidos fins, que o(a) paciente acima foi atendido(a) nesta data e necessita de ___ dia(s) de afastamento de suas atividades, a partir de hoje.",
  PEDIDO_EXAME: "Solicito:\n\n1. \n\nIndicação clínica: ",
  RELATORIO: "",
};
