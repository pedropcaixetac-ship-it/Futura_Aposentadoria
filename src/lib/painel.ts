// Regras do Painel do dono do sistema (cadastro das clínicas), sem acesso ao banco,
// para poderem ser testadas sozinhas.
import { isValidCpf, onlyDigits } from "./format";

// Códigos que não podem virar código de clínica, para não confundir com partes do sistema.
const RESERVED_SLUGS = ["painel", "admin", "login", "api", "suporte", "teleconsulta", "www"];

// Sugere o código da clínica a partir do nome: "Clínica São José" vira "clinica-sao-jose".
export function suggestSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

export function slugError(slug: string) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "O código da clínica só pode ter letras minúsculas sem acento, números e hífen.";
  if (slug.length < 3 || slug.length > 30) return "O código da clínica precisa ter de 3 a 30 caracteres.";
  if (RESERVED_SLUGS.includes(slug)) return "Este código é reservado pelo sistema. Escolha outro.";
  return null;
}

// Mesma conta do CPF, com os pesos do CNPJ.
export function isValidCnpj(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const digit = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(d[12]) && digit(13) === Number(d[13]);
}

// CPF (clínica de pessoa física) também sai com pontos.
export function formatCnpj(value: string | null | undefined) {
  const d = onlyDigits(value);
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (d.length !== 14) return value ?? "";
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || null;
const email = (formData: FormData, key: string) => text(formData, key)?.toLowerCase() ?? null;

export type ClinicInput = {
  name: string;
  slug: string;
  // CNPJ, ou CPF para quem atende como pessoa física. Só números.
  cnpj: string | null;
  address: string | null;
  phone: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

export function parseClinic(formData: FormData): ClinicInput {
  return {
    name: text(formData, "name") ?? "",
    slug: (text(formData, "slug") ?? "").toLowerCase(),
    cnpj: onlyDigits(text(formData, "cnpj")) || null,
    address: text(formData, "address"),
    phone: text(formData, "phone"),
    contactName: text(formData, "contactName"),
    contactEmail: email(formData, "contactEmail"),
    contactPhone: text(formData, "contactPhone"),
  };
}

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function validateClinic(input: ClinicInput) {
  if (!input.name) return "Informe o nome da clínica.";
  const slug = slugError(input.slug);
  if (slug) return slug;
  if (input.cnpj && !(input.cnpj.length === 14 ? isValidCnpj(input.cnpj) : isValidCpf(input.cnpj))) {
    return "Confira o CNPJ (ou o CPF, se a clínica for de pessoa física).";
  }
  if (!input.contactName) return "Informe o nome do responsável pela clínica.";
  if (input.contactEmail && !looksLikeEmail(input.contactEmail)) return "Confira o e-mail do responsável.";
  return null;
}

// Primeiro gerente do sistema da clínica nova. Depois ele mesmo cadastra a equipe em "Servidores".
export type ManagerInput = { name: string; email: string; cpf: string | null; password: string };

export function parseManager(formData: FormData): ManagerInput {
  return {
    name: text(formData, "managerName") ?? "",
    email: email(formData, "managerEmail") ?? "",
    cpf: onlyDigits(text(formData, "managerCpf")) || null,
    password: String(formData.get("managerPassword") ?? ""),
  };
}

export function validateManager(input: ManagerInput) {
  if (!input.name) return "Informe o nome do gerente do sistema da clínica.";
  if (!looksLikeEmail(input.email)) return "Informe um e-mail válido para o gerente entrar no sistema.";
  if (input.cpf && !isValidCpf(input.cpf)) return "Confira o CPF do gerente.";
  if (input.password.length < 8) return "A senha inicial do gerente precisa ter pelo menos 8 caracteres.";
  return null;
}

// Modelos de atendimento com que toda clínica nova começa (cada profissional pode copiar e ajustar).
export const STARTER_TEMPLATES = [
  {
    name: "Consulta (primeira vez)",
    fields: [
      { key: "queixa", label: "Queixa principal", type: "textarea" },
      { key: "hda", label: "História da doença atual", type: "textarea" },
      { key: "exameFisico", label: "Exame físico", type: "textarea" },
      { key: "hipotese", label: "Hipóteses diagnósticas", type: "textarea" },
      { key: "conduta", label: "Conduta", type: "textarea" },
    ],
  },
  {
    name: "Retorno",
    fields: [
      { key: "evolucao", label: "Evolução", type: "textarea" },
      { key: "exames", label: "Resultados de exames", type: "textarea" },
      { key: "conduta", label: "Conduta", type: "textarea" },
    ],
  },
];

export const platformActionLabel: Record<string, string> = {
  PAINEL_LOGIN: "Entrou no painel",
  PAINEL_LOGIN_FALHOU: "Tentativa de entrar no painel falhou",
  PAINEL_LOGOUT: "Saiu do painel",
  CLINICA_CRIADA: "Cadastrou clínica",
  CLINICA_ALTERADA: "Alterou dados da clínica",
  CLINICA_SUSPENSA: "Suspendeu o acesso da clínica",
  CLINICA_REATIVADA: "Reativou o acesso da clínica",
  PLANO_CRIADO: "Criou plano",
  PLANO_ALTERADO: "Alterou plano",
  CLINICA_PLANO: "Mudou o plano ou o vencimento da clínica",
  PAGAMENTO_REGISTRADO: "Registrou pagamento da mensalidade",
  PROBLEMA_RESOLVIDO: "Marcou problema como resolvido",
  PROBLEMA_REABERTO: "Reabriu problema",
  PAINEL_SENHA_ALTERADA: "Trocou a própria senha",
  PAINEL_DUAS_ETAPAS_ATIVADA: "Ligou a verificação em duas etapas",
  PAINEL_DUAS_ETAPAS_DESATIVADA: "Desligou a verificação em duas etapas",
  PAINEL_CODIGO_RECUPERACAO: "Entrou com código de recuperação",
  EQUIPE_CRIADA: "Cadastrou pessoa na equipe do painel",
  EQUIPE_BLOQUEADA: "Bloqueou pessoa da equipe do painel",
  EQUIPE_REATIVADA: "Reativou pessoa da equipe do painel",
  EQUIPE_SENHA_PROVISORIA: "Gerou senha provisória para pessoa da equipe",
  EQUIPE_DUAS_ETAPAS_REMOVIDA: "Desligou a verificação em duas etapas de pessoa da equipe",
  EQUIPE_DONO: "Mudou quem é dono no painel",
};
