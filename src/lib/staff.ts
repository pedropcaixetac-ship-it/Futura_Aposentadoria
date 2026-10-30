import type { Role } from "@prisma/client";
import { isValidCpf, onlyDigits, roleLabel } from "./format";

// Cadastro de servidores (equipe da clínica): o que vem do formulário e as regras de validação.
export type StaffInput = {
  name: string;
  systemAccess: boolean;
  email: string | null;
  cpf: string | null;
  role: Role;
  jobTitle: string | null;
  sector: string | null;
  specialty: string | null;
  councilType: string | null;
  councilNumber: string | null;
  councilUf: string | null;
  password: string | null;
};

export const councilTypes = ["CRM", "CRP", "CRO", "CRN", "COREN", "CREFITO", "CRFa", "CRF", "CRBM"];

export const terminationReasons = ["Pedido de demissão", "Dispensa pela clínica", "Fim de contrato", "Aposentadoria", "Outro"];

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export function parseStaff(formData: FormData): StaffInput {
  const role = String(formData.get("role") ?? "");
  const systemAccess = formData.get("systemAccess") === "on";
  return {
    name: text(formData, "name") ?? "",
    systemAccess,
    email: text(formData, "email")?.toLowerCase() ?? null,
    cpf: onlyDigits(text(formData, "cpf")) || null,
    // Quem não entra no sistema fica com o perfil de menor acesso.
    role: (systemAccess ? (role in roleLabel ? role : "") : "RECEPCAO") as Role,
    jobTitle: text(formData, "jobTitle"),
    sector: text(formData, "sector"),
    specialty: text(formData, "specialty"),
    councilType: text(formData, "councilType"),
    councilNumber: text(formData, "councilNumber"),
    councilUf: text(formData, "councilUf")?.toUpperCase() ?? null,
    password: systemAccess ? String(formData.get("password") ?? "") || null : null,
  };
}

// needsPassword: cadastro novo com acesso, ou alguém que passou a ter acesso agora.
export function validateStaff(input: StaffInput, { needsPassword }: { needsPassword: boolean }) {
  if (input.name.split(/\s+/).length < 2) return "Informe o nome completo.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return "Informe um e-mail válido.";
  if (input.systemAccess && !input.email) return "Informe o e-mail de quem vai entrar no sistema.";
  if (input.cpf && !isValidCpf(input.cpf)) return "CPF inválido.";
  if (!input.role) return "Escolha o perfil de acesso.";
  if (input.councilNumber && (!input.councilType || !input.councilUf)) return "Informe o conselho e o estado (UF) do registro.";
  if (input.councilUf && !/^[A-Z]{2}$/.test(input.councilUf)) return "UF do conselho inválida (ex.: SP).";
  if (input.systemAccess && needsPassword && !input.password) return "Crie uma senha inicial para a pessoa entrar no sistema.";
  if (input.password && input.password.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  return null;
}

// Coluna "Função": o cargo informado ou, se não houver, o perfil de acesso.
export function staffFunction(user: { jobTitle: string | null; role: Role }) {
  return user.jobTitle ?? roleLabel[user.role];
}
