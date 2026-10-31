import { onlyDigits } from "./format";
import { sameNameKey } from "./patient";

// Busca na tabela SIGTAP: números procuram pelo código ("0211" ou "02.11.02.003-6"),
// palavras procuram no nome, em qualquer ordem e sem ligar para acentos ("infarto miocardio").
export function procedureWhere(q: string) {
  const term = q.trim();
  if (/^[\d.\-\s]+$/.test(term)) return { code: { startsWith: onlyDigits(term) } };
  const words = sameNameKey(term).split(" ").filter(Boolean);
  return { AND: words.map((w) => ({ searchName: { contains: w } })) };
}
