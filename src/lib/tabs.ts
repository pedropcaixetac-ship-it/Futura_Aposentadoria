import type { Role } from "@prisma/client";
import { canManageCharges, canManageTemplates, canViewClinical, canWorkClinical, RECEPTION_ROLES, type PermissionUser } from "./permissions";

// Abas do sistema que o administrador pode liberar ou tirar de cada pessoa
// em "Cadastro de servidores > Editar permissões".
export type TabKey =
  | "recepcao"
  | "atender"
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

export type TabUser = PermissionUser & { customTabs: boolean; allowedTabs: string[] };

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
    href: "/atender",
    description: "Sala de espera e agenda do dia do próprio profissional, de onde ele inicia o atendimento.",
    defaultRoles: allRoles,
    blockedReason: (u) => (canWorkClinical(u) ? null : "Só para profissionais de saúde."),
  },
  {
    key: "agenda",
    label: "Agenda",
    href: "/agenda",
    description: "Quem tem a aba Recepção vê a agenda de todos; o profissional, só a própria.",
    defaultRoles: allRoles,
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

export function tabBlockedReason(user: PermissionUser, key: TabKey) {
  return TABS.find((t) => t.key === key)?.blockedReason?.(user) ?? null;
}

// O gerente do sistema tem sempre todas as abas, para que ninguém fique trancado do lado de fora.
export function hasTab(user: TabUser, key: TabKey) {
  const tab = TABS.find((t) => t.key === key);
  if (!tab || tab.blockedReason?.(user)) return false;
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
