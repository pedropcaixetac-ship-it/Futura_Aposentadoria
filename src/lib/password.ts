import { onlyDigits } from "./format";

export const PASSWORD_MIN = 10;

export const PASSWORD_RULES = `Pelo menos ${PASSWORD_MIN} caracteres, com letra maiúscula, letra minúscula, número e símbolo (ex.: ! @ # $ %).`;

type Person = { name?: string | null; cpf?: string | null; email?: string | null; birthDate?: Date | null };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Devolve o que falta na senha, ou null se ela está boa.
// Regras do Pedro (maiúscula, minúscula, número, símbolo) + tamanho mínimo + nada que seja fácil de chutar.
export function passwordProblem(password: string, person: Person = {}) {
  if (password.length < PASSWORD_MIN) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (!/[A-Z]/.test(password)) return "A senha precisa ter pelo menos uma letra maiúscula.";
  if (!/[a-z]/.test(password)) return "A senha precisa ter pelo menos uma letra minúscula.";
  if (!/[0-9]/.test(password)) return "A senha precisa ter pelo menos um número.";
  if (!/[^A-Za-z0-9]/.test(password)) return "A senha precisa ter pelo menos um símbolo (ex.: ! @ # $ %).";

  const lower = plain(password);
  const digits = onlyDigits(password);
  const names = plain(person.name ?? "").split(/\s+/).filter((w) => w.length >= 3);
  if (names.some((w) => lower.includes(w))) return "A senha não pode ter o nome da pessoa.";
  const emailUser = plain(person.email?.split("@")[0] ?? "");
  if (emailUser.length >= 3 && lower.includes(emailUser)) return "A senha não pode ter o e-mail da pessoa.";
  const cpf = onlyDigits(person.cpf);
  if (cpf && (digits.includes(cpf.slice(0, 6)) || digits.includes(cpf.slice(-6)))) return "A senha não pode ter o CPF da pessoa.";
  if (person.birthDate) {
    const d = person.birthDate.toISOString().slice(0, 10).split("-"); // [ano, mês, dia]
    const dates = [d[2] + d[1] + d[0], d[2] + d[1] + d[0].slice(2), d[0] + d[1] + d[2]];
    if (dates.some((x) => digits.includes(x))) return "A senha não pode ter a data de nascimento.";
  }
  return null;
}
