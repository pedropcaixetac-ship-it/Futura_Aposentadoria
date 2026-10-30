import { createHash } from "node:crypto";
import type { DocumentType } from "@prisma/client";

export type TemplateField = { key: string; label: string; type: "text" | "textarea" };
export type Diagnosis = { code: string; description: string };

// JSON com as chaves sempre na mesma ordem. O banco reorganiza as chaves
// ao guardar, então sem isso a impressão digital mudaria sozinha.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

// Impressão digital do atendimento finalizado. Se qualquer letra mudar
// depois, o resultado deixa de bater e o sistema mostra o alerta.
export function encounterHash(data: {
  id: string;
  patientId: string;
  professionalId: string;
  fields: unknown;
  content: unknown;
  diagnoses: unknown;
  finalizedAt: Date;
}) {
  const payload = canonicalJson([
    data.id,
    data.patientId,
    data.professionalId,
    data.fields,
    data.content,
    data.diagnoses,
    data.finalizedAt.toISOString(),
  ]);
  return createHash("sha256").update(payload).digest("hex");
}

// Impressão digital do documento emitido, para detectar adulteração.
export function documentHash(data: {
  id: string;
  patientId: string;
  authorId: string;
  type: DocumentType;
  body: string;
  createdAt: Date;
}) {
  const payload = JSON.stringify([data.id, data.patientId, data.authorId, data.type, data.body, data.createdAt.toISOString()]);
  return createHash("sha256").update(payload).digest("hex");
}

// Mantém só os campos que existem no modelo, com texto limpo.
export function sanitizeContent(fields: TemplateField[], raw: Record<string, unknown>) {
  const content: Record<string, string> = {};
  for (const field of fields) {
    const value = raw[field.key];
    content[field.key] = typeof value === "string" ? value.trim() : "";
  }
  return content;
}

export function parseDiagnoses(raw: string | null): Diagnosis[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((d) => typeof d?.code === "string" && typeof d?.description === "string")
      .map((d) => ({ code: d.code, description: d.description }));
  } catch {
    return [];
  }
}

export function slugifyKey(label: string) {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
