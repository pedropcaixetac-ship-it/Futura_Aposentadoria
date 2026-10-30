import type { Diagnosis, TemplateField } from "./record";

// Filtros do histórico de atendimentos, vindos do endereço da página
// (assim dá para voltar, recarregar e imprimir com os mesmos filtros).
export type HistoryFilters = {
  palavra: string;
  profissional: string;
  modelo: string;
  cid: string;
  de: string;
  ate: string;
};

export const filterKeys = ["palavra", "profissional", "modelo", "cid", "de", "ate"] as const;

export function parseHistoryFilters(params: Record<string, string | string[] | undefined>): HistoryFilters {
  const get = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v ?? "").trim();
  };
  return {
    palavra: get("palavra"),
    profissional: get("profissional"),
    modelo: get("modelo"),
    cid: get("cid").toUpperCase(),
    de: /^\d{4}-\d{2}-\d{2}$/.test(get("de")) ? get("de") : "",
    ate: /^\d{4}-\d{2}-\d{2}$/.test(get("ate")) ? get("ate") : "",
  };
}

export function hasFilters(f: HistoryFilters) {
  return filterKeys.some((k) => f[k] !== "");
}

export function filtersQuery(f: HistoryFilters) {
  const q = new URLSearchParams();
  for (const k of filterKeys) if (f[k]) q.set(k, f[k]);
  const s = q.toString();
  return s ? `?${s}` : "";
}

// "Evolução livre" não tem modelo; usamos este valor no filtro.
export const FREE_TEMPLATE = "livre";

export type HistoryEncounter = {
  startedAt: Date;
  professionalId: string;
  templateId: string | null;
  fields: unknown;
  content: unknown;
  diagnoses: unknown;
  addenda: { text: string }[];
};

// Tira acentos e maiúsculas, para "cefaleia" achar "Cefaléia".
export function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Todos os textos de um atendimento onde a busca por palavra procura.
export function encounterTexts(e: HistoryEncounter) {
  const fields = e.fields as TemplateField[];
  const content = e.content as Record<string, string>;
  const diagnoses = e.diagnoses as Diagnosis[];
  return [
    ...fields.map((f) => content[f.key] ?? ""),
    ...diagnoses.map((d) => `${d.code} ${d.description}`),
    ...e.addenda.map((a) => a.text),
  ].filter(Boolean);
}

// Datas do filtro são dias no horário de Brasília (UTC-3).
function dayStart(day: string) {
  return new Date(`${day}T00:00:00-03:00`);
}

export function filterEncounters<T extends HistoryEncounter>(encounters: T[], f: HistoryFilters): T[] {
  const word = normalize(f.palavra);
  const from = f.de ? dayStart(f.de) : null;
  const to = f.ate ? new Date(dayStart(f.ate).getTime() + 24 * 3600 * 1000) : null;
  return encounters.filter((e) => {
    if (f.profissional && e.professionalId !== f.profissional) return false;
    if (f.modelo && (e.templateId ?? FREE_TEMPLATE) !== f.modelo) return false;
    if (from && e.startedAt < from) return false;
    if (to && e.startedAt >= to) return false;
    if (f.cid && !(e.diagnoses as Diagnosis[]).some((d) => d.code.toUpperCase().startsWith(f.cid))) return false;
    if (word && !encounterTexts(e).some((t) => normalize(t).includes(word))) return false;
    return true;
  });
}

// Divide o texto em pedaços, marcando onde a palavra aparece (ignorando acentos).
export function highlight(text: string, term: string): { text: string; match: boolean }[] {
  const word = normalize(term.trim());
  if (!word) return [{ text, match: false }];
  // Para cada letra do texto normalizado, guarda a posição no texto original.
  let norm = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const n = normalize(text[i]);
    for (const ch of n) {
      norm += ch;
      origin.push(i);
    }
  }
  const parts: { text: string; match: boolean }[] = [];
  let last = 0;
  let pos = norm.indexOf(word);
  while (pos !== -1) {
    const start = origin[pos];
    const end = origin[pos + word.length - 1] + 1;
    if (start > last) parts.push({ text: text.slice(last, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    last = end;
    pos = norm.indexOf(word, pos + word.length);
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}

// Trecho curto em volta da primeira vez que a palavra aparece.
export function excerpt(texts: string[], term: string, radius = 80) {
  const word = normalize(term.trim());
  for (const t of texts) {
    const pos = normalize(t).indexOf(word);
    if (word && pos !== -1) {
      const start = Math.max(0, pos - radius);
      const end = Math.min(t.length, pos + word.length + radius);
      return `${start > 0 ? "…" : ""}${t.slice(start, end)}${end < t.length ? "…" : ""}`;
    }
  }
  return null;
}

// Agrupa por ano, mantendo a ordem (mais recente primeiro).
export function groupByYear<T extends { startedAt: Date }>(encounters: T[]) {
  const groups: { year: number; items: T[] }[] = [];
  for (const e of encounters) {
    const year = Number(e.startedAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric" }));
    const g = groups.at(-1);
    if (g && g.year === year) g.items.push(e);
    else groups.push({ year, items: [e] });
  }
  return groups;
}
