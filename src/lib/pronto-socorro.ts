// Regras do pronto-socorro (versão hospitalar), sem acesso ao banco, para poderem ser testadas sozinhas.
import type { EmergencyOutcome, EmergencyStatus, RiskLevel } from "@prisma/client";

// Classificação de risco com as cores do Protocolo de Manchester e o tempo-alvo até o médico.
export const RISKS: { key: RiskLevel; label: string; meaning: string; targetMinutes: number; className: string }[] = [
  { key: "VERMELHO", label: "Vermelho", meaning: "Emergência: atendimento imediato", targetMinutes: 0, className: "bg-red-600 text-white" },
  { key: "LARANJA", label: "Laranja", meaning: "Muito urgente: até 10 minutos", targetMinutes: 10, className: "bg-orange-500 text-white" },
  { key: "AMARELO", label: "Amarelo", meaning: "Urgente: até 60 minutos", targetMinutes: 60, className: "bg-yellow-300 text-slate-900" },
  { key: "VERDE", label: "Verde", meaning: "Pouco urgente: até 2 horas", targetMinutes: 120, className: "bg-green-600 text-white" },
  { key: "AZUL", label: "Azul", meaning: "Não urgente: até 4 horas", targetMinutes: 240, className: "bg-sky-600 text-white" },
];

export const riskInfo = (risk: RiskLevel) => RISKS.find((r) => r.key === risk)!;

export const statusLabel: Record<EmergencyStatus, string> = {
  AGUARDANDO_TRIAGEM: "Aguardando triagem",
  AGUARDANDO_MEDICO: "Aguardando médico",
  EM_ATENDIMENTO: "Em atendimento",
  OBSERVACAO: "Em observação",
  ENCERRADO: "Encerrado",
};

export const outcomeLabel: Record<EmergencyOutcome, string> = {
  ALTA: "Alta",
  INTERNACAO: "Internação",
  TRANSFERENCIA: "Transferência para outro serviço",
  OBITO: "Óbito",
  EVASAO: "Evasão (saiu sem alta)",
};

export const ARRIVAL_MODES = ["Por meios próprios", "SAMU", "Bombeiros", "Ambulância de outro serviço", "Polícia", "Outro"];

// Minutos inteiros entre dois instantes (nunca negativo).
export function minutesBetween(from: Date, to = new Date()) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}

export function waitLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// Passou do tempo-alvo da cor? (vermelho passa na hora)
export function overdue(risk: RiskLevel, waitingMinutes: number) {
  const target = riskInfo(risk).targetMinutes;
  return target === 0 ? true : waitingMinutes > target;
}

// Fila do médico: primeiro a cor mais grave; na mesma cor, quem foi triado antes.
const order: Record<RiskLevel, number> = { VERMELHO: 0, LARANJA: 1, AMARELO: 2, VERDE: 3, AZUL: 4 };
export function compareQueue(a: { risk: RiskLevel | null; triagedAt: Date | null; arrivedAt: Date }, b: typeof a) {
  const ra = a.risk ? order[a.risk] : 9;
  const rb = b.risk ? order[b.risk] : 9;
  if (ra !== rb) return ra - rb;
  return (a.triagedAt ?? a.arrivedAt).getTime() - (b.triagedAt ?? b.arrivedAt).getTime();
}

// No PS quem chama o paciente e dá o desfecho é o médico (CRM). A enfermagem faz a triagem.
// Os perfis finos de cada função no hospital vêm depois.
export function isPhysician(user: { role: string; councilNumber?: string | null; councilType?: string | null }) {
  return (user.role === "PROFISSIONAL" || user.role === "ADMIN") && !!user.councilNumber && user.councilType === "CRM";
}
