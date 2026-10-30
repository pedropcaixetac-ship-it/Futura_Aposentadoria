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

export const roleLabel = {
  ADMIN: "Administrador",
  PROFISSIONAL: "Profissional de saúde (acesso completo)",
  TECNICO: "Profissional de saúde (acesso restrito)",
  RECEPCAO: "Recepção",
  ADMINISTRATIVO: "Auxiliar administrativo",
} as const;

export function onlyDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function formatPhone(phone: string | null | undefined) {
  const d = onlyDigits(phone);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return phone ?? "";
}

export function formatCep(cep: string | null | undefined) {
  const d = onlyDigits(cep);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : (cep ?? "");
}

// Máscaras aplicadas enquanto a pessoa digita.
export const masks = {
  cpf: (v: string) =>
    onlyDigits(v).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"),
  phone: (v: string) => {
    const d = onlyDigits(v).slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    const split = d.length === 11 ? 7 : 6;
    return `(${d.slice(0, 2)}) ${d.slice(2, split)}-${d.slice(split)}`;
  },
  cep: (v: string) => onlyDigits(v).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2"),
  cns: (v: string) =>
    onlyDigits(v).slice(0, 15).replace(/(\d{3})(\d)/, "$1 $2").replace(/(\d{4})(\d)/, "$1 $2").replace(/(\d{4})(\d)/, "$1 $2"),
};

// Cartão Nacional de Saúde: 15 dígitos, começa com 1, 2, 7, 8 ou 9 e a soma ponderada é múltipla de 11.
export function isValidCns(value: string) {
  const cns = onlyDigits(value);
  if (cns.length !== 15 || !"12789".includes(cns[0])) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += Number(cns[i]) * (15 - i);
  return sum % 11 === 0;
}
