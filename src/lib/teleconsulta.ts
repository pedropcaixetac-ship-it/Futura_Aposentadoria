import { randomBytes } from "node:crypto";

// Por quanto tempo o link enviado ao paciente funciona.
export const LINK_HOURS = 24;

// Teleconsulta marcada na agenda: o link funciona desde a marcação até 12 horas
// depois do fim do horário (cobre atrasos e consultas que se estendem).
export const SCHEDULED_EXTRA_HOURS = 12;

export function scheduledLinkExpiry(endsAt: Date) {
  return new Date(endsAt.getTime() + SCHEDULED_EXTRA_HOURS * 3600 * 1000);
}

export function newTeleconsultationToken() {
  return randomBytes(24).toString("base64url");
}

export function teleconsultationPath(token: string) {
  return `/teleconsulta/${token}`;
}

export type TeleconsultationState = "ENCERRADA" | "EXPIRADA" | "AGUARDANDO_TERMO" | "LIBERADA";

export function teleconsultationState(
  t: { endedAt: Date | null; expiresAt: Date; consentAt: Date | null },
  now = new Date(),
): TeleconsultationState {
  if (t.endedAt) return "ENCERRADA";
  if (t.expiresAt <= now) return "EXPIRADA";
  if (!t.consentAt) return "AGUARDANDO_TERMO";
  return "LIBERADA";
}

// Termo de consentimento (Resolução CFM 2.314/2022, art. 15, e LGPD).
// O texto aceito é guardado por inteiro na teleconsulta.
export function consentText(p: { clinicName: string; professionalName: string; council: string | null }) {
  const professional = p.council ? `${p.professionalName} (${p.council})` : p.professionalName;
  return [
    `Termo de consentimento para teleconsulta — ${p.clinicName}`,
    "",
    `Autorizo ser atendido(a) por ${professional} por meio de teleconsulta, com áudio e vídeo pela internet, conforme a Resolução CFM nº 2.314/2022 e a Lei nº 14.510/2022.`,
    "",
    "Declaro que fui informado(a) de que:",
    "1. A teleconsulta tem limitações por não haver exame físico presencial. O profissional pode, a qualquer momento, indicar que eu seja atendido(a) pessoalmente.",
    "2. Posso recusar ou interromper a teleconsulta quando quiser e pedir atendimento presencial.",
    "3. A chamada não é gravada. O que for relevante para minha saúde será registrado no meu prontuário, que é sigiloso e guardado com segurança.",
    "4. Meus dados pessoais e de saúde são tratados conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), apenas para o meu atendimento.",
    "5. Devo estar em local reservado, com boa conexão, e não devo gravar a chamada sem autorização do profissional.",
    "6. Receitas, atestados e pedidos de exame emitidos na teleconsulta terão assinatura digital válida.",
  ].join("\n");
}

export { councilLabel } from "./staff";
