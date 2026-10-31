// Regras de laboratório e imagem (catálogo, referência e fila), sem acesso ao banco, para poderem ser testadas sozinhas.
import type { ExamPriority, ExamSector, ExamStatus } from "@prisma/client";

export const sectorLabel: Record<ExamSector, string> = { LABORATORIO: "Laboratório", IMAGEM: "Imagem" };
export const MODALITIES = ["Raio X", "Ultrassom", "Tomografia", "Ressonância", "Mamografia", "Eletrocardiograma", "Ecocardiograma", "Densitometria", "Endoscopia"];
export const examStatusLabel: Record<ExamStatus, string> = { SOLICITADO: "Pedido", AGENDADO: "Agendado", COLETADO: "Coletado / realizado", LAUDADO: "Resultado pronto", CANCELADO: "Cancelado" };
export const priorityLabel: Record<ExamPriority, string> = { ROTINA: "Rotina", URGENTE: "Urgente" };

export type ResultField = { name: string; unit: string; min: number | null; max: number | null };
export type ResultValue = { name: string; unit: string; value: string; min: number | null; max: number | null };

const num = (t: string) => {
  const n = Number(t.trim().replace(",", "."));
  return t.trim() !== "" && Number.isFinite(n) ? n : null;
};

// Campos do resultado digitados um por linha: "Hemoglobina; g/dL; 12; 16" (referência opcional).
export function parseFields(text: string): ResultField[] | null {
  const fields: ResultField[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [name, unit = "", min = "", max = ""] = line.split(";").map((p) => p.trim());
    if (!name) return null;
    const lo = min ? num(min) : null;
    const hi = max ? num(max) : null;
    if ((min && lo === null) || (max && hi === null) || (lo !== null && hi !== null && lo > hi)) return null;
    fields.push({ name, unit, min: lo, max: hi });
  }
  return fields;
}

export function fieldsToText(fields: ResultField[]) {
  return fields.map((f) => [f.name, f.unit, f.min ?? "", f.max ?? ""].join("; ")).join("\n");
}

export function asFields(json: unknown): ResultField[] {
  return Array.isArray(json) ? (json as ResultField[]) : [];
}

export function asValues(json: unknown): ResultValue[] {
  return Array.isArray(json) ? (json as ResultValue[]) : [];
}

// Valor fora da referência: BAIXO ou ALTO. Texto (ex.: "negativo") ou sem referência: null.
export function flag(v: { value: string; min: number | null; max: number | null }): "BAIXO" | "ALTO" | null {
  const n = num(v.value);
  if (n === null) return null;
  if (v.min !== null && n < v.min) return "BAIXO";
  if (v.max !== null && n > v.max) return "ALTO";
  return null;
}

export function referenceLabel(f: { min: number | null; max: number | null; unit: string }) {
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  if (f.min !== null && f.max !== null) return `${fmt(f.min)} a ${fmt(f.max)}`;
  if (f.min !== null) return `acima de ${fmt(f.min)}`;
  if (f.max !== null) return `até ${fmt(f.max)}`;
  return "";
}

// Fila: urgente primeiro, depois o horário marcado (ou do pedido), mais antigo antes.
export function queueOrder(a: { priority: ExamPriority; scheduledAt: Date | null; createdAt: Date }, b: typeof a) {
  if (a.priority !== b.priority) return a.priority === "URGENTE" ? -1 : 1;
  return (a.scheduledAt ?? a.createdAt).getTime() - (b.scheduledAt ?? b.createdAt).getTime();
}
