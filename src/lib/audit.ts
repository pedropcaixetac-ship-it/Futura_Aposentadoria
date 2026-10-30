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
  HISTORICO_PESQUISADO: "Pesquisou no histórico do prontuário",
  HISTORICO_IMPRESSO: "Imprimiu o histórico do prontuário",
  RESUMO_CLINICO_ALTERADO: "Alterou alergias/medicamentos/antecedentes",
  ATENDIMENTO_INICIADO: "Iniciou atendimento",
  ATENDIMENTO_VISUALIZADO: "Abriu atendimento",
  ATENDIMENTO_SALVO: "Salvou rascunho do atendimento",
  ATENDIMENTO_FINALIZADO: "Finalizou atendimento",
  ADENDO_CRIADO: "Adicionou adendo",
  MODELO_CRIADO: "Criou modelo de atendimento",
  MODELO_ALTERADO: "Alterou modelo de atendimento",
  AGENDAMENTO_CRIADO: "Marcou consulta",
  AGENDAMENTO_ALTERADO: "Remarcou ou alterou consulta",
  AGENDAMENTO_SITUACAO: "Mudou a situação da consulta",
  AGENDAMENTO_DESMARCADO: "Desmarcou consulta",
  HORARIOS_ALTERADOS: "Alterou horários de atendimento",
  BLOQUEIO_CRIADO: "Bloqueou horário na agenda",
  BLOQUEIO_EXCLUIDO: "Excluiu bloqueio da agenda",
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
  RETORNO_PREVISTO: "Anotou o retorno previsto da consulta",
  DOCUMENTO_ASSINADO: "Assinou digitalmente (ICP-Brasil)",
  PDF_ASSINADO_BAIXADO: "Baixou PDF assinado",
  CONTRATO_SALVO: "Salvou dados de contrato de trabalho",
  FERIAS_REGISTRADAS: "Registrou férias",
  FERIAS_APAGADAS: "Apagou férias",
  FOLHA_ALTERADA: "Alterou a folha do mês",
  FOLHA_LANCADA: "Lançou salários no financeiro",
  OBRIGACAO_CUMPRIDA: "Marcou obrigação como feita",
  OBRIGACAO_DESFEITA: "Desmarcou obrigação",
  OBRIGACAO_ALTERADA: "Alterou lista de obrigações",
  CONTADOR_ALTERADO: "Alterou dados da contabilidade",
  CONTABILIDADE_EXPORTADA: "Exportou planilha para o contador",
  SERVIDOR_CRIADO: "Cadastrou servidor",
  SERVIDOR_ALTERADO: "Alterou cadastro de servidor",
  PERMISSOES_ALTERADAS: "Alterou as abas que um servidor acessa",
  SERVIDOR_DESLIGADO: "Registrou desligamento de servidor",
  SERVIDOR_REATIVADO: "Reativou acesso de servidor",
};
