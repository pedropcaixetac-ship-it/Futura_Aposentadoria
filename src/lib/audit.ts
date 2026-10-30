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
};
