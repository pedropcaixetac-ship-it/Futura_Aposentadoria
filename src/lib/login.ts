import { isValidCpf, onlyDigits } from "./format";

// O que a pessoa digitou no campo de login: e-mail, CPF ou registro no conselho (CRM, CRP...).
export type LoginId =
  | { kind: "email"; email: string }
  | { kind: "cpf"; cpf: string }
  | { kind: "council"; number: string; letters: string[] };

export function parseLoginId(input: string): LoginId | null {
  const value = input.trim();
  if (!value) return null;
  if (value.includes("@")) return { kind: "email", email: value.toLowerCase() };
  const digits = onlyDigits(value);
  if (!digits) return null;
  // CPF tem 11 números; registros de conselho são bem mais curtos.
  if (digits.length === 11 && isValidCpf(digits)) return { kind: "cpf", cpf: digits };
  // Letras opcionais, como "CRM" ou "SP" em "CRM 123456/SP", ajudam a separar profissionais com o mesmo número.
  return { kind: "council", number: digits, letters: value.toUpperCase().match(/[A-Z]+/g) ?? [] };
}

type CouncilUser = { councilType: string | null; councilNumber: string | null; councilUf: string | null };

const noLeadingZeros = (s: string) => s.replace(/^0+/, "");

// Cada estado tem a própria numeração (o 38526 de GO não é o 38526 do DF), por isso a UF é obrigatória.
export function matchesCouncil(user: CouncilUser, id: { number: string; letters: string[] }, uf: string) {
  if (!user.councilNumber || !uf || user.councilUf?.toUpperCase() !== uf.toUpperCase()) return false;
  // Aceita o número inteiro ("06/98765") ou só a parte depois da barra ("98765"), com ou sem zeros à esquerda.
  const whole = onlyDigits(user.councilNumber);
  const afterSlash = onlyDigits(user.councilNumber.split("/").pop());
  const typed = noLeadingZeros(id.number);
  if (typed !== noLeadingZeros(whole) && typed !== noLeadingZeros(afterSlash)) return false;
  const known = [user.councilType?.toUpperCase(), user.councilUf?.toUpperCase()];
  return id.letters.every((l) => known.includes(l));
}
