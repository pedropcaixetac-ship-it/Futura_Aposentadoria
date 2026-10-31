import type { Role } from "@prisma/client";
import { tabInPlan } from "./plans";
import { canManageCharges, canManageTemplates, canViewClinical, canWorkClinical, RECEPTION_ROLES, type PermissionUser } from "./permissions";

// Abas do sistema que o administrador pode liberar ou tirar de cada pessoa
// em "Cadastro de servidores > Editar permissões".
export type TabKey =
  | "recepcao"
  | "atender"
  | "pronto-socorro"
  | "internacao"
  | "leitos"
  | "visitas"
  | "agenda"
  | "pacientes"
  | "modelos"
  | "textos-prontos"
  | "assinatura"
  | "financeiro"
  | "meu-financeiro"
  | "contabilidade"
  | "auditoria"
  | "servidores";

// modules: módulos do plano da clínica (só vem de quem está conectado; ausente = sem restrição de plano).
// institution: tipo da instituição (CLINICA ou HOSPITAL); as abas hospitalares só existem no hospital.
export type TabUser = PermissionUser & { customTabs: boolean; allowedTabs: string[]; modules?: string[] | null; institution?: string | null };

type Tab = {
  key: TabKey;
  label: string;
  href: string;
  description: string;
  // Perfis que recebem a aba quando a pessoa ainda não tem permissões personalizadas.
  defaultRoles: Role[];
  // Regra que nenhuma permissão muda (ex.: conteúdo clínico só para quem tem conselho).
  // Devolve o motivo quando a pessoa não pode ter a aba.
  blockedReason?: (user: PermissionUser) => string | null;
  // false: vale como permissão, mas não tem item próprio no menu (ex.: assinatura fica dentro de "Meu cadastro").
  menu?: false;
  // Setor hospitalar: só existe quando a instituição é um hospital.
  hospital?: true;
  // Nome da aba no hospital, quando é diferente do nome na clínica.
  hospitalLabel?: string;
};

const allRoles: Role[] = ["ADMIN", "PROFISSIONAL", "TECNICO", "RECEPCAO", "ADMINISTRATIVO"];

// A ordem desta lista é a ordem do menu lateral.
export const TABS: Tab[] = [
  {
    key: "recepcao",
    label: "Recepção",
    href: "/recepcao",
    description: "Chegada e falta dos pacientes do dia.",
    defaultRoles: RECEPTION_ROLES,
  },
  {
    key: "atender",
    label: "Atender",
    hospitalLabel: "Ambulatório",
    href: "/atender",
    description: "Sala de espera e agenda do dia do próprio profissional, de onde ele inicia o atendimento.",
    defaultRoles: allRoles,
    blockedReason: (u) => (canWorkClinical(u) ? null : "Só para profissionais de saúde."),
  },
  {
    key: "pronto-socorro",
    label: "Pronto-socorro",
    href: "/pronto-socorro",
    description: "Chegada dos pacientes, triagem com classificação de risco pela enfermagem e fila do médico.",
    // Quem faz o quê dentro do PS (recepção, triagem, médico) segue o registro profissional; os perfis finos vêm depois.
    defaultRoles: allRoles,
    hospital: true,
  },
  {
    key: "internacao",
    label: "Internação",
    href: "/internacao",
    description: "Mapa de leitos, internar, trocar de leito e dar alta (a alta só profissional de saúde com conselho).",
    // A recepção do hospital não interna: cuida da agenda, do fluxo dos pacientes e das visitas.
    defaultRoles: ["ADMIN", "PROFISSIONAL", "TECNICO", "ADMINISTRATIVO"],
    hospital: true,
  },
  {
    key: "leitos",
    label: "Alas e leitos",
    href: "/internacao/leitos",
    description: "Cadastrar alas e leitos, bloquear e desbloquear leitos.",
    menu: false,
    defaultRoles: ["ADMIN", "ADMINISTRATIVO"],
    hospital: true,
  },
  {
    key: "visitas",
    label: "Visitas",
    href: "/visitas",
    description: "Registrar a entrada e a saída das visitas aos pacientes internados.",
    defaultRoles: RECEPTION_ROLES,
    hospital: true,
  },
  {
    key: "agenda",
    label: "Agenda",
    href: "/agenda",
    description: "Quem tem a aba Recepção vê a agenda de todos; o profissional, só a própria.",
    // O técnico não tem agenda própria (só profissionais com conselho têm). Pode receber a aba junto com a Recepção.
    defaultRoles: ["ADMIN", "PROFISSIONAL", "RECEPCAO", "ADMINISTRATIVO"],
  },
  {
    key: "pacientes",
    label: "Pacientes",
    href: "/pacientes",
    description: "Cadastro dos pacientes. O prontuário só aparece para profissionais de saúde.",
    defaultRoles: allRoles,
  },
  {
    key: "modelos",
    label: "Modelos de atendimento",
    href: "/modelos",
    description: "Criar e alterar os modelos de atendimento.",
    defaultRoles: allRoles,
    blockedReason: (u) => (canManageTemplates(u) ? null : "Só para profissionais de saúde."),
  },
  {
    key: "textos-prontos",
    label: "Meus textos prontos",
    href: "/textos-prontos",
    description: "Textos prontos da própria pessoa para usar no atendimento.",
    defaultRoles: allRoles,
    blockedReason: (u) => (canWorkClinical(u) ? null : "Só para profissionais de saúde."),
  },
  {
    key: "assinatura",
    label: "Assinatura digital",
    href: "/meu-cadastro#certificado",
    description: "Assinar receitas, atestados e atendimentos com certificado ICP-Brasil. O certificado fica em \"Meu cadastro\".",
    menu: false,
    defaultRoles: allRoles,
    blockedReason: (u) => (canViewClinical(u) ? null : "Só para profissionais de saúde com acesso completo e registro em conselho."),
  },
  {
    key: "financeiro",
    label: "Financeiro",
    href: "/financeiro",
    description: "Resumo, receitas, despesas, compras, repasse e preços. A recepção vê só as receitas (lança cobranças e recebe pagamentos).",
    defaultRoles: ["ADMIN", "ADMINISTRATIVO", "RECEPCAO"],
    blockedReason: (u) => (canManageCharges(u) ? null : "Só para gerente do sistema, administrativo e recepção."),
  },
  {
    key: "meu-financeiro",
    label: "Meu financeiro",
    href: "/meu-financeiro",
    description: "Quanto o profissional recebeu dos próprios atendimentos, a porcentagem e o repasse do mês.",
    defaultRoles: ["ADMIN", "PROFISSIONAL", "TECNICO"],
    blockedReason: (u) => (canWorkClinical(u) ? null : "Só para profissionais de saúde."),
  },
  {
    key: "contabilidade",
    label: "Contabilidade e trabalhista",
    href: "/contabilidade",
    description: "Contratos, férias, folha do mês, impostos e planilha para o contador.",
    defaultRoles: ["ADMIN", "ADMINISTRATIVO"],
  },
  {
    key: "auditoria",
    label: "Auditoria",
    href: "/auditoria",
    description: "Quem abriu ou alterou cada prontuário, e quando. Exclusiva do gerente do sistema.",
    defaultRoles: ["ADMIN"],
    blockedReason: (u) => (u.role === "ADMIN" ? null : "Só para o gerente do sistema."),
  },
  {
    key: "servidores",
    label: "Cadastro de servidores",
    href: "/servidores",
    description: "Cadastrar a equipe, mudar permissões e registrar desligamentos.",
    defaultRoles: ["ADMIN", "ADMINISTRATIVO"],
  },
];

// A aba existe neste tipo de instituição? O hospital tem tudo o que a clínica tem e mais os setores hospitalares.
// Nome que aparece para a pessoa: no hospital, "Atender" vira "Ambulatório".
export function tabLabel(tab: Pick<Tab, "label" | "hospitalLabel">, institution: string | null | undefined) {
  return (institution === "HOSPITAL" && tab.hospitalLabel) || tab.label;
}

export function tabInInstitution(institution: string | null | undefined, key: TabKey) {
  const tab = TABS.find((t) => t.key === key);
  return !!tab && (!tab.hospital || institution === "HOSPITAL");
}

export function tabBlockedReason(user: PermissionUser, key: TabKey) {
  return TABS.find((t) => t.key === key)?.blockedReason?.(user) ?? null;
}

// O gerente do sistema tem sempre todas as abas, para que ninguém fique trancado do lado de fora.
export function hasTab(user: TabUser, key: TabKey) {
  const tab = TABS.find((t) => t.key === key);
  if (!tab || tab.blockedReason?.(user)) return false;
  if (!tabInInstitution(user.institution, key)) return false;
  // Módulo fora do plano da clínica: ninguém tem a aba, nem o gerente.
  if (!tabInPlan(user.modules, key)) return false;
  if (user.role === "ADMIN") return true;
  return user.customTabs ? user.allowedTabs.includes(key) : tab.defaultRoles.includes(user.role);
}

export function userTabs(user: TabUser) {
  return TABS.filter((t) => hasTab(user, t.key));
}

// Limpa a lista enviada pelo formulário: só abas que existem e que a pessoa pode ter.
export function sanitizeTabs(user: PermissionUser, keys: string[]) {
  return TABS.filter((t) => keys.includes(t.key) && !t.blockedReason?.(user)).map((t) => t.key);
}

// Mensagens padrão do WhatsApp: o administrador e quem tem a aba Recepção.
export function canEditWhatsappMessages(user: TabUser) {
  return user.role === "ADMIN" || hasTab(user, "recepcao");
}
