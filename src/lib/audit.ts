import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

export async function audit(entry: {
  clinicId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  patientId?: string | null;
  details?: Prisma.InputJsonValue;
}) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
  await prisma.auditLog.create({ data: { ...entry, ip } });
}

export const auditActionLabel: Record<string, string> = {
  LOGIN: "Entrou no sistema",
  LOGIN_FALHOU: "Tentativa de login falhou",
  LOGOUT: "Saiu do sistema",
  PACIENTE_CRIADO: "Cadastrou paciente",
  PACIENTE_ALTERADO: "Alterou cadastro do paciente",
  PRONTUARIO_VISUALIZADO: "Abriu o prontuário",
  RESUMO_CLINICO_ALTERADO: "Alterou alergias/medicamentos/antecedentes",
  ATENDIMENTO_INICIADO: "Iniciou atendimento",
  ATENDIMENTO_VISUALIZADO: "Abriu atendimento",
  ATENDIMENTO_SALVO: "Salvou rascunho do atendimento",
  ATENDIMENTO_FINALIZADO: "Finalizou atendimento",
  ADENDO_CRIADO: "Adicionou adendo",
  MODELO_CRIADO: "Criou modelo de atendimento",
  MODELO_ALTERADO: "Alterou modelo de atendimento",
  COBRANCA_CRIADA: "Lançou cobrança",
  PAGAMENTO_RECEBIDO: "Registrou pagamento",
  COBRANCA_CANCELADA: "Cancelou cobrança",
  RECIBO_EMITIDO: "Emitiu recibo",
  DESPESA_CRIADA: "Lançou despesa",
  DESPESA_PAGA: "Pagou despesa",
  DESPESA_CANCELADA: "Cancelou despesa",
  COMPRA_LANCADA: "Lançou nota fiscal de compra",
  COMPRA_CANCELADA: "Cancelou nota fiscal de compra",
  PRECO_CRIADO: "Cadastrou preço",
  PRECO_ALTERADO: "Alterou preço",
  REPASSE_ALTERADO: "Alterou porcentagem de repasse",
  CLINICA_ALTERADA: "Alterou dados da clínica",
  DOCUMENTO_EMITIDO: "Emitiu receita/atestado/pedido",
  PDF_ATENDIMENTO_GERADO: "Gerou PDF do atendimento",
  PDF_DOCUMENTO_GERADO: "Gerou PDF de documento",
  WHATSAPP_AUTORIZADO: "Registrou autorização do paciente para WhatsApp",
  WHATSAPP_REVOGADO: "Registrou que o paciente retirou a autorização para WhatsApp",
  WHATSAPP_ABERTO: "Abriu conversa no WhatsApp com o paciente",
};
