// Conta hospitalar: o que a internação gastou, montado a partir do que os setores registraram.
// Sem acesso ao banco, para poder ser testado sozinho.
import { daysAdmitted } from "./internacao";

export type PayerKind = "SUS" | "CONVENIO" | "PARTICULAR";

// O campo "SUS, convênio ou particular" da internação é texto livre.
export function payerKind(insurance: string | null | undefined): PayerKind {
  const v = (insurance ?? "").trim().toLowerCase();
  if (!v || v.startsWith("particular")) return "PARTICULAR";
  if (/^sus\b/.test(v)) return "SUS";
  return "CONVENIO";
}

export const payerLabel: Record<PayerKind, string> = { SUS: "SUS", CONVENIO: "Convênio", PARTICULAR: "Particular" };

export const billKindLabel: Record<string, string> = {
  DIARIA: "Diárias",
  MEDICAMENTO: "Medicamentos e materiais",
  EXAME: "Exames",
  CIRURGIA: "Centro cirúrgico",
  TAXA: "Taxas",
  OUTRO: "Outros",
};

// Diárias: cada dia do calendário que passou, contando pelo menos uma (entrou e saiu no mesmo dia).
export function billDays(admittedAt: Date, dischargedAt: Date | null, now = new Date()) {
  return Math.max(1, daysAdmitted(admittedAt, dischargedAt ?? now));
}

// Diárias por tipo de ala (UTI, enfermaria, apartamento...): cada diária vai para a ala onde o paciente estava
// na virada do dia (meia-noite de Brasília). Quem entrou e saiu no mesmo dia paga uma diária da ala onde estava.
export function dailiesByWard(admittedAt: Date, dischargedAt: Date | null, stays: WardStay[], now = new Date()): Map<string, number> {
  const total = billDays(admittedAt, dischargedAt, now);
  const sorted = [...stays].sort((a, b) => a.from.getTime() - b.from.getTime());
  const result = new Map<string, number>();
  if (!sorted.length) return result;
  const kindAt = (t: number) => (sorted.filter((s) => s.from.getTime() <= t).pop() ?? sorted[0]).wardKind;
  const add = (kind: string) => result.set(kind, (result.get(kind) ?? 0) + 1);
  // Meia-noite de Brasília = 03:00 UTC. Primeira virada depois da entrada.
  const local = new Date(admittedAt.getTime() - 3 * 3600_000);
  let midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, 3);
  const end = (dischargedAt ?? now).getTime();
  let counted = 0;
  for (; midnight <= end && counted < total; midnight += 24 * 3600_000, counted++) add(kindAt(midnight));
  // Entrou e saiu no mesmo dia (ou ainda não virou o dia): a diária vai para a ala atual.
  for (; counted < total; counted++) add(kindAt(end));
  return result;
}

// Horas de sala: da entrada à saída do paciente; sem os tempos, a duração prevista. Hora começada conta inteira.
export function roomHours(s: { patientInAt: Date | null; patientOutAt: Date | null; expectedMinutes: number }) {
  const minutes = s.patientInAt && s.patientOutAt ? (s.patientOutAt.getTime() - s.patientInAt.getTime()) / 60_000 : s.expectedMinutes;
  return Math.max(1, Math.ceil(minutes / 60));
}

export type AutoLine = { kind: "DIARIA" | "MEDICAMENTO" | "EXAME" | "CIRURGIA"; source: string; description: string; quantity: number; unitCents: number; priceKey: string };

// Por onde o paciente passou: o tipo de ala de cada leito, a partir do momento em que entrou nele.
export type WardStay = { from: Date; wardKind: string };

export type BillSources = {
  admittedAt: Date;
  dischargedAt: Date | null;
  stays: WardStay[];
  // Saldo dispensado por produto (dispensado menos devolvido).
  medications: { productId: string; name: string; unit: string; quantity: number }[];
  exams: { id: string; name: string; at: Date }[];
  surgeries: { id: string; procedure: string; hours: number }[];
};

export const priceKey = {
  diaria: (wardKind: string) => `diaria:${wardKind}`,
  exame: (examTypeId: string) => `exame:${examTypeId}`,
  med: (productId: string) => `med:${productId}`,
  sala: "sala:hora",
};

// Lançamentos automáticos. examTypeOf liga cada exame ao seu tipo (para achar o preço).
export function autoLines(src: BillSources, prices: Map<string, number>, examTypeOf: Map<string, string>, now = new Date()): AutoLine[] {
  const price = (key: string) => prices.get(key) ?? 0;
  const lines: AutoLine[] = [];
  for (const [wardKind, days] of dailiesByWard(src.admittedAt, src.dischargedAt, src.stays, now)) {
    const dk = priceKey.diaria(wardKind);
    lines.push({ kind: "DIARIA", source: `diarias:${wardKind}`, description: `Diária de ${wardKind.toLowerCase()}`, quantity: days, unitCents: price(dk), priceKey: dk });
  }
  for (const m of src.medications) {
    if (m.quantity <= 0) continue;
    const k = priceKey.med(m.productId);
    lines.push({ kind: "MEDICAMENTO", source: `med:${m.productId}`, description: `${m.name} (${m.unit})`, quantity: m.quantity, unitCents: price(k), priceKey: k });
  }
  for (const e of src.exams) {
    const k = priceKey.exame(examTypeOf.get(e.id) ?? "");
    lines.push({ kind: "EXAME", source: `exame:${e.id}`, description: e.name, quantity: 1, unitCents: price(k), priceKey: k });
  }
  for (const s of src.surgeries) {
    lines.push({ kind: "CIRURGIA", source: `cirurgia:${s.id}`, description: `Taxa de sala: ${s.procedure}`, quantity: s.hours, unitCents: price(priceKey.sala), priceKey: priceKey.sala });
  }
  return lines;
}

export function billTotal(items: { quantity: number; unitCents: number }[]) {
  return items.reduce((sum, i) => sum + i.quantity * i.unitCents, 0);
}
