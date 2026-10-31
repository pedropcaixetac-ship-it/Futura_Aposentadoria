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

// Horas de sala: da entrada à saída do paciente; sem os tempos, a duração prevista. Hora começada conta inteira.
export function roomHours(s: { patientInAt: Date | null; patientOutAt: Date | null; expectedMinutes: number }) {
  const minutes = s.patientInAt && s.patientOutAt ? (s.patientOutAt.getTime() - s.patientInAt.getTime()) / 60_000 : s.expectedMinutes;
  return Math.max(1, Math.ceil(minutes / 60));
}

export type AutoLine = { kind: "DIARIA" | "MEDICAMENTO" | "EXAME" | "CIRURGIA"; source: string; description: string; quantity: number; unitCents: number; priceKey: string };

export type BillSources = {
  admittedAt: Date;
  dischargedAt: Date | null;
  wardKind: string;
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
  const days = billDays(src.admittedAt, src.dischargedAt, now);
  const dk = priceKey.diaria(src.wardKind);
  lines.push({ kind: "DIARIA", source: "diarias", description: `Diária de ${src.wardKind.toLowerCase()}`, quantity: days, unitCents: price(dk), priceKey: dk });
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
