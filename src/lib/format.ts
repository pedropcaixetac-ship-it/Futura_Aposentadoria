export function formatDate(date: Date | null | undefined) {
  if (!date) return "";
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function formatDateTime(date: Date | null | undefined) {
  if (!date) return "";
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export function age(birthDate: Date | null | undefined) {
  if (!birthDate) return null;
  const now = new Date();
  let years = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) years--;
  return years;
}

export function formatCpf(cpf: string | null | undefined) {
  if (!cpf) return "";
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function isValidCpf(value: string) {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const digit = ((sum * 10) % 11) % 10;
    if (digit !== Number(cpf[len])) return false;
  }
  return true;
}

export const roleLabel = { ADMIN: "Administrador", PROFISSIONAL: "Profissional de saúde", RECEPCAO: "Recepção" } as const;

// "31/12/1990" vira a data; qualquer outra coisa, null.
export function parseBrDate(value: string) {
  const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return date.getUTCDate() === Number(m[1]) && date.getUTCMonth() === Number(m[2]) - 1 ? date : null;
}

// Dia de um momento (data e hora), no horário de Brasília.
export function formatDay(date: Date | null | undefined) {
  if (!date) return "";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
