// Regras da equipe da empresa no Painel do dono, sem acesso ao banco.
import { randomInt } from "node:crypto";

// Senha provisória da equipe do painel, mostrada uma vez para o dono passar à pessoa.
// Sem letras parecidas (O/0, I/l/1) para não errar ao ditar.
export function temporaryPassword() {
  const pick = (chars: string, n: number) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join("");
  return `${pick("ABCDEFGHJKLMNPQRSTUVWXYZ", 3)}${pick("abcdefghjkmnpqrstuvwxyz", 3)}-${pick("23456789", 4)}!`;
}

// Regras da equipe do painel: ninguém tira o próprio acesso nem o próprio papel de dono,
// assim sempre sobra pelo menos um dono ativo.
export function teamChangeError(me: { id: string }, target: { id: string }, change: "bloquear" | "dono") {
  if (me.id !== target.id) return null;
  return change === "bloquear" ? "Você não pode bloquear o próprio acesso." : "Você não pode tirar o seu próprio papel de dono.";
}
