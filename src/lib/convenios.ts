// Regras do cadastro de convênios (faturamento no padrão TISS da ANS).
import { parseMoney } from "./money";

function digits(value: string) {
  return value.replace(/\D/g, "");
}

// Registro da operadora na ANS: 6 números (ex.: 005711). Devolve null se não for válido.
export function normalizeAnsCode(value: string): string | null {
  const code = digits(value);
  return /^\d{6}$/.test(code) ? code : null;
}

// CNES do estabelecimento: 7 números.
export function normalizeCnes(value: string): string | null {
  const code = digits(value);
  return /^\d{7}$/.test(code) ? code : null;
}

// Código TUSS de procedimento: 8 números (ex.: 10101012 = consulta em consultório).
// Aceita com pontos e traço, como aparece impresso (1.01.01.01-2).
export function normalizeTussCode(value: string): string | null {
  const code = digits(value);
  return /^\d{8}$/.test(code) ? code : null;
}

// Mostra o código TUSS como aparece nas tabelas: 1.01.01.01-2.
export function formatTussCode(code: string) {
  return /^\d{8}$/.test(code) ? `${code[0]}.${code.slice(1, 3)}.${code.slice(3, 5)}.${code.slice(5, 7)}-${code[7]}` : code;
}

// Número inteiro de dias entre 0 e 365, ou null quando vazio.
export function parseDays(value: string): number | null | undefined {
  const clean = value.trim();
  if (!clean) return null;
  if (!/^\d{1,3}$/.test(clean) || Number(clean) > 365) return undefined;
  return Number(clean);
}

export type PriceLine = { tussCode: string; description: string; priceCents: number };

// Lê uma lista colada (de planilha ou do contrato), uma linha por procedimento:
//   10101012; Consulta em consultório; 150,00
// Aceita ponto e vírgula ou tabulação entre as colunas. Devolve as linhas boas e os erros,
// com o número da linha, para a pessoa corrigir só o que está errado.
export function parsePriceList(text: string): { lines: PriceLine[]; errors: string[] } {
  const lines: PriceLine[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    const n = index + 1;
    const parts = raw.split(/[;\t]/).map((p) => p.trim());
    if (parts.length < 3) {
      errors.push(`Linha ${n}: separe código, descrição e valor com ponto e vírgula.`);
      return;
    }
    const tussCode = normalizeTussCode(parts[0]);
    const priceCents = parseMoney(parts[parts.length - 1]);
    const description = parts.slice(1, -1).join(" ").trim();
    if (!tussCode) errors.push(`Linha ${n}: o código TUSS precisa ter 8 números.`);
    else if (!description) errors.push(`Linha ${n}: falta a descrição.`);
    else if (!priceCents) errors.push(`Linha ${n}: valor inválido (ex.: 150,00).`);
    else if (seen.has(tussCode)) errors.push(`Linha ${n}: código ${tussCode} repetido na lista.`);
    else {
      seen.add(tussCode);
      lines.push({ tussCode, description: description.slice(0, 200), priceCents });
    }
  });
  return { lines, errors };
}
