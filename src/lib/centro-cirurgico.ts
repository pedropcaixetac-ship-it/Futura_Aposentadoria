// Regras do centro cirúrgico (tempos, choque de sala e cirurgia segura), sem acesso ao banco, para poderem ser testadas sozinhas.
import type { AnesthesiaKind, ChecklistPhase, SurgeryStatus } from "@prisma/client";

export const anesthesiaLabel: Record<AnesthesiaKind, string> = {
  GERAL: "Geral",
  RAQUI: "Raquidiana",
  PERIDURAL: "Peridural",
  SEDACAO: "Sedação",
  BLOQUEIO: "Bloqueio periférico",
  LOCAL: "Local",
};

export const surgeryStatusLabel: Record<SurgeryStatus, string> = { AGENDADA: "Agendada", EM_SALA: "Em sala", REALIZADA: "Realizada", CANCELADA: "Cancelada" };

export const LATERALITIES = ["Direito", "Esquerdo", "Bilateral"];

// Cirurgia segura (Organização Mundial da Saúde): o que se confere em cada momento.
export const CHECKLIST: Record<ChecklistPhase, { label: string; when: string; items: string[] }> = {
  ENTRADA: {
    label: "Entrada (antes da anestesia)",
    when: "antes da indução anestésica",
    items: [
      "Paciente confirmou identidade, local, procedimento e consentimento",
      "Local da cirurgia demarcado (ou não se aplica)",
      "Equipamentos e medicações anestésicas conferidos",
      "Oxímetro de pulso no paciente e funcionando",
      "Alergias conhecidas conferidas",
      "Risco de via aérea difícil avaliado (material disponível se sim)",
      "Risco de perda de sangue avaliado (acesso e sangue reservados se sim)",
    ],
  },
  PAUSA: {
    label: "Pausa cirúrgica (antes da incisão)",
    when: "antes da incisão na pele",
    items: [
      "Todos da equipe se apresentaram pelo nome e função",
      "Cirurgião, anestesista e enfermagem confirmaram paciente, local e procedimento",
      "Antibiótico profilático feito nos últimos 60 minutos (ou não se aplica)",
      "Etapas críticas e duração prevista revisadas pelo cirurgião",
      "Preocupações do paciente revisadas pelo anestesista",
      "Esterilização do material confirmada (indicadores) pela enfermagem",
      "Exames de imagem essenciais disponíveis (ou não se aplica)",
    ],
  },
  SAIDA: {
    label: "Saída (antes de o paciente sair da sala)",
    when: "antes de o paciente sair da sala",
    items: [
      "Nome do procedimento registrado",
      "Contagem de instrumentais, compressas e agulhas correta",
      "Amostras para exame identificadas com o nome do paciente",
      "Problemas com equipamentos resolvidos ou comunicados",
      "Cuidados da recuperação pós-anestésica combinados pela equipe",
    ],
  },
};

export const PHASES: ChecklistPhase[] = ["ENTRADA", "PAUSA", "SAIDA"];

// Os tempos da cirurgia, na ordem. "needs" = etapa da cirurgia segura que precisa estar feita antes.
export const STEPS = [
  { key: "patientInAt", label: "Paciente entrou na sala", needs: null },
  { key: "anesthesiaAt", label: "Início da anestesia", needs: "ENTRADA" },
  { key: "incisionAt", label: "Incisão (início da cirurgia)", needs: "PAUSA" },
  { key: "endAt", label: "Fim da cirurgia", needs: null },
  { key: "patientOutAt", label: "Paciente saiu da sala", needs: "SAIDA" },
] as const satisfies readonly { key: string; label: string; needs: ChecklistPhase | null }[];

export type StepKey = (typeof STEPS)[number]["key"];
type Times = Record<StepKey, Date | null>;

// Próximo tempo a registrar (ou null quando terminou). Sem anestesia, pula o início da anestesia.
export function nextStep(times: Times, hasAnesthesia: boolean) {
  for (const step of STEPS) {
    if (step.key === "anesthesiaAt" && !hasAnesthesia) continue;
    if (!times[step.key]) return step;
  }
  return null;
}

// Etapa da cirurgia segura que falta antes do próximo tempo.
export function missingChecklist(step: (typeof STEPS)[number] | null, done: ChecklistPhase[], hasAnesthesia: boolean): ChecklistPhase | null {
  if (!step) return null;
  // Sem anestesia, a entrada vale antes da incisão.
  if (step.key === "incisionAt" && !hasAnesthesia && !done.includes("ENTRADA")) return "ENTRADA";
  return step.needs && !done.includes(step.needs) ? step.needs : null;
}

export function minutesBetween(a: Date | null, b: Date | null) {
  return a && b ? Math.round((b.getTime() - a.getTime()) / 60_000) : null;
}

export function durationLabel(minutes: number | null) {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

// Duas cirurgias na mesma sala se cruzam? (o horário de uma começa antes da outra terminar)
export function overlaps(aStart: Date, aMinutes: number, bStart: Date, bMinutes: number) {
  const aEnd = aStart.getTime() + aMinutes * 60_000;
  const bEnd = bStart.getTime() + bMinutes * 60_000;
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd;
}
