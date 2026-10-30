import type { Role } from "@prisma/client";
import { isValidCns, isValidCpf, onlyDigits, roleLabel } from "./format";

// Cadastro de servidores (equipe da clínica): o que vem do formulário e as regras de validação.
export type StaffInput = {
  name: string;
  socialName: string | null;
  birthDate: Date | null;
  sex: string | null;
  rg: string | null;
  cns: string | null;
  motherName: string | null;
  maritalStatus: string | null;
  photo: string | null;
  phone: string | null;
  landline: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
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

// O que cada perfil de acesso enxerga, para explicar na tela de cadastro.
export const ROLE_HELP: Record<Role, string> = {
  ADMIN: "Vê tudo, inclusive cadastro de servidores, financeiro e auditoria.",
  PROFISSIONAL: "Atende pacientes e vê o prontuário completo, com todas as consultas anteriores.",
  TECNICO: "Registra os próprios atendimentos e vê o resumo clínico (alergias, medicações). Não abre as consultas de outros profissionais.",
  RECEPCAO: "Agenda, recepção, cadastro de pacientes e cobranças. Não vê o prontuário.",
  ADMINISTRATIVO: "Contabilidade e trabalhista. Não vê o prontuário.",
};

export const councilTypes = ["CRM", "COREN", "CRP", "CRN", "CREFITO", "CRFa", "CRO", "CRF", "CRBM", "CREF", "CRTR"];

// Funções/cargos já cadastrados. Ao escolher uma, o formulário sugere o perfil de acesso,
// o conselho e a lista de especialidades. "Outro" deixa digitar.
// honorific: profissões em que o sistema escreve "Dr."/"Dra." antes do nome.
export type JobTitle = { title: string; group: string; role: Role | null; council?: string; specialties?: string; honorific?: boolean };

export const JOB_TITLES: JobTitle[] = [
  { title: "Médico(a)", group: "Saúde: acesso completo ao prontuário", role: "PROFISSIONAL", council: "CRM", specialties: "medicina", honorific: true },
  { title: "Enfermeiro(a)", group: "Saúde: acesso completo ao prontuário", role: "PROFISSIONAL", council: "COREN", specialties: "enfermagem" },
  { title: "Psicólogo(a)", group: "Saúde: acesso completo ao prontuário", role: "PROFISSIONAL", council: "CRP", specialties: "psicologia", honorific: true },
  { title: "Nutricionista", group: "Saúde: acesso completo ao prontuário", role: "PROFISSIONAL", council: "CRN", specialties: "nutricao" },
  { title: "Fisioterapeuta", group: "Saúde: acesso completo ao prontuário", role: "PROFISSIONAL", council: "CREFITO", specialties: "fisioterapia" },
  { title: "Fonoaudiólogo(a)", group: "Saúde: acesso completo ao prontuário", role: "PROFISSIONAL", council: "CRFa", specialties: "fonoaudiologia" },
  { title: "Terapeuta ocupacional", group: "Saúde: acesso completo ao prontuário", role: "PROFISSIONAL", council: "CREFITO" },
  { title: "Cirurgião(ã)-dentista", group: "Saúde: acesso completo ao prontuário", role: "PROFISSIONAL", council: "CRO", specialties: "odontologia", honorific: true },
  { title: "Farmacêutico(a)", group: "Saúde: acesso completo ao prontuário", role: "PROFISSIONAL", council: "CRF" },
  { title: "Biomédico(a)", group: "Saúde: acesso completo ao prontuário", role: "PROFISSIONAL", council: "CRBM" },
  { title: "Profissional de educação física", group: "Saúde: acesso completo ao prontuário", role: "PROFISSIONAL", council: "CREF" },
  { title: "Técnico(a) de enfermagem", group: "Saúde: acesso restrito", role: "TECNICO", council: "COREN" },
  { title: "Auxiliar de enfermagem", group: "Saúde: acesso restrito", role: "TECNICO", council: "COREN" },
  { title: "Técnico(a) em radiologia", group: "Saúde: acesso restrito", role: "TECNICO", council: "CRTR" },
  { title: "Técnico(a) de laboratório", group: "Saúde: acesso restrito", role: "TECNICO" },
  { title: "Auxiliar de saúde bucal", group: "Saúde: acesso restrito", role: "TECNICO", council: "CRO" },
  { title: "Recepcionista", group: "Administrativo", role: "RECEPCAO" },
  { title: "Auxiliar administrativo", group: "Administrativo", role: "ADMINISTRATIVO" },
  { title: "Faturista", group: "Administrativo", role: "ADMINISTRATIVO" },
  { title: "Gerente / administrador(a)", group: "Administrativo", role: "ADMIN" },
  { title: "Auxiliar de limpeza", group: "Apoio (sem acesso ao sistema)", role: null },
  { title: "Copeiro(a)", group: "Apoio (sem acesso ao sistema)", role: null },
  { title: "Porteiro(a) / segurança", group: "Apoio (sem acesso ao sistema)", role: null },
  { title: "Manutenção", group: "Apoio (sem acesso ao sistema)", role: null },
];

// Especialidades por profissão (medicina: lista do CFM; demais: dos respectivos conselhos).
export const SPECIALTIES: Record<string, string[]> = {
  medicina: [
    "Clínica médica", "Medicina de família e comunidade", "Pediatria", "Ginecologia e obstetrícia", "Cardiologia",
    "Dermatologia", "Endocrinologia e metabologia", "Gastroenterologia", "Geriatria", "Neurologia", "Oftalmologia",
    "Ortopedia e traumatologia", "Otorrinolaringologia", "Psiquiatria", "Pneumologia", "Reumatologia", "Urologia",
    "Nefrologia", "Infectologia", "Hematologia e hemoterapia", "Oncologia clínica", "Alergia e imunologia",
    "Angiologia", "Cirurgia geral", "Cirurgia plástica", "Cirurgia vascular", "Coloproctologia", "Mastologia",
    "Medicina do trabalho", "Medicina esportiva", "Nutrologia", "Acupuntura", "Homeopatia", "Medicina física e reabilitação",
    "Neurocirurgia", "Radiologia e diagnóstico por imagem", "Anestesiologia", "Patologia",
  ],
  enfermagem: ["Enfermagem geral", "Saúde da família", "Obstetrícia", "Estomaterapia", "Dermatologia", "Saúde do trabalhador", "Urgência e emergência"],
  psicologia: ["Psicologia clínica", "Neuropsicologia", "Psicologia da saúde", "Psicologia infantil", "Psicologia hospitalar", "Psicopedagogia", "Psicologia do trânsito"],
  nutricao: ["Nutrição clínica", "Nutrição esportiva", "Nutrição materno-infantil", "Nutrição funcional"],
  fisioterapia: ["Traumato-ortopédica", "Neurofuncional", "Respiratória", "Pélvica", "Esportiva", "Dermatofuncional", "Gerontologia", "Acupuntura"],
  fonoaudiologia: ["Audiologia", "Linguagem", "Motricidade orofacial", "Voz", "Disfagia"],
  odontologia: ["Clínica geral", "Ortodontia", "Endodontia", "Implantodontia", "Periodontia", "Odontopediatria", "Prótese dentária", "Cirurgia bucomaxilofacial", "Harmonização orofacial"],
};

export const SECTORS = [
  "Recepção", "Administração", "Financeiro", "Faturamento",
  "Consultório 1", "Consultório 2", "Consultório 3", "Consultório 4", "Consultório 5", "Consultório 6",
  "Triagem / enfermagem", "Sala de procedimentos", "Sala de vacinas", "Coleta / laboratório", "Imagem / raio-X",
  "Farmácia / almoxarifado", "Serviços gerais",
];

export function jobTitleInfo(title: string | null | undefined) {
  return JOB_TITLES.find((j) => j.title === title);
}

export const terminationReasons = ["Pedido de demissão", "Dispensa pela clínica", "Fim de contrato", "Aposentadoria", "Outro"];

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export function parseStaff(formData: FormData): StaffInput {
  const role = String(formData.get("role") ?? "");
  const systemAccess = formData.get("systemAccess") === "on";
  const birth = text(formData, "birthDate");
  const photo = text(formData, "photo");
  return {
    name: stripHonorific(text(formData, "name") ?? ""),
    socialName: text(formData, "socialName"),
    birthDate: birth && /^\d{4}-\d{2}-\d{2}$/.test(birth) ? new Date(`${birth}T00:00:00Z`) : null,
    sex: text(formData, "sex"),
    rg: text(formData, "rg"),
    cns: onlyDigits(text(formData, "cns")) || null,
    motherName: text(formData, "motherName"),
    maritalStatus: text(formData, "maritalStatus"),
    // Só aceita a foto reduzida no navegador (data URL de imagem).
    photo: photo?.startsWith("data:image/") ? photo : null,
    phone: onlyDigits(text(formData, "phone")) || null,
    landline: onlyDigits(text(formData, "landline")) || null,
    emergencyContactName: text(formData, "emergencyContactName"),
    emergencyContactPhone: onlyDigits(text(formData, "emergencyContactPhone")) || null,
    cep: onlyDigits(text(formData, "cep")) || null,
    street: text(formData, "street"),
    number: text(formData, "number"),
    complement: text(formData, "complement"),
    district: text(formData, "district"),
    city: text(formData, "city"),
    state: text(formData, "state"),
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
  if (!input.cpf) return "Informe o CPF.";
  if (!isValidCpf(input.cpf)) return "CPF inválido.";
  if (!input.birthDate) return "Informe a data de nascimento.";
  if (input.birthDate > new Date()) return "A data de nascimento não pode ser no futuro.";
  if (!input.phone) return "Informe o celular.";
  if (input.phone.length < 10) return "Celular incompleto.";
  if (input.cns && !isValidCns(input.cns)) return "Cartão SUS (CNS) inválido.";
  if (input.photo && input.photo.length > 200_000) return "A foto ficou grande demais. Tente outra imagem.";
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

// "Dr."/"Dra." vem da função (médico, psicólogo, dentista), nunca do nome digitado.
// Também reconhece funções escritas à mão antes das listas prontas (ex.: "Médica", "Dentista").
const HONORIFIC_TITLE = /^(m[ée]dic|psic[óo]log|cirurgi[ãa]|dentista)/i;
const FEMININE_TITLE = /^(m[ée]dica|psic[óo]loga|cirurgi[ãa]-dentista)$/i;

type NamedUser = { name: string; jobTitle: string | null; sex: string | null };

export function honorific(user: Omit<NamedUser, "name">) {
  const title = user.jobTitle?.trim();
  if (!title || !(jobTitleInfo(title)?.honorific || HONORIFIC_TITLE.test(title))) return null;
  return user.sex === "F" || FEMININE_TITLE.test(title) ? "Dra." : "Dr.";
}

// Nome como aparece no sistema: "Dra. Ana Souza" para a médica, "Maria Silva" para o administrativo.
export function displayName(user: NamedUser) {
  const prefix = honorific(user);
  return prefix ? `${prefix} ${user.name}` : user.name;
}

// Tira um "Dr."/"Dra." digitado no começo do nome (o sistema coloca sozinho).
export function stripHonorific(name: string) {
  return name.replace(/^\s*(dr|dra)\.?\s+/i, "").trim();
}
