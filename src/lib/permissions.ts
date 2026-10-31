import type { Role } from "@prisma/client";

export type PermissionUser = {
  id: string;
  role: Role;
  councilNumber: string | null;
  // Abas escolhidas pelo administrador em "Editar permissões" (quando customTabs é verdadeiro).
  customTabs?: boolean;
  allowedTabs?: string[];
};

// Perfis que já recebem a aba Recepção sem permissão personalizada.
export const RECEPTION_ROLES: Role[] = ["ADMIN", "RECEPCAO", "ADMINISTRATIVO"];

// Quem tem a aba Recepção: confirma presença, marca chegada ou falta e cuida da agenda de todos.
// Fica aqui (e não em tabs.ts) para as regras da agenda usarem sem import circular.
function hasReceptionTab(user: PermissionUser) {
  if (user.role === "ADMIN") return true;
  return user.customTabs ? !!user.allowedTabs?.includes("recepcao") : RECEPTION_ROLES.includes(user.role);
}

// Acesso completo ao prontuário: profissionais de saúde (e administradores) com registro em conselho.
// Recepção, auxiliar administrativo e administradores sem registro veem apenas o cadastro.
export function canViewClinical(user: PermissionUser) {
  return (user.role === "PROFISSIONAL" || user.role === "ADMIN") && !!user.councilNumber;
}

// Trabalha no prontuário: acesso completo ou restrito (técnico/auxiliar de enfermagem).
// O acesso restrito vê alergias, medicamentos e antecedentes, faz os próprios atendimentos,
// mas não abre as consultas de outros profissionais.
export function canWorkClinical(user: PermissionUser) {
  return canViewClinical(user) || user.role === "TECNICO";
}

export function canOpenEncounter(user: PermissionUser, encounter: { professionalId: string }) {
  return canViewClinical(user) || (canWorkClinical(user) && encounter.professionalId === user.id);
}

export function canEditEncounter(
  user: PermissionUser,
  encounter: { professionalId: string; status: "RASCUNHO" | "FINALIZADO" },
) {
  return encounter.status === "RASCUNHO" && encounter.professionalId === user.id;
}

export function canAddAddendum(user: PermissionUser, encounter: { status: "RASCUNHO" | "FINALIZADO" }) {
  return encounter.status === "FINALIZADO" && canViewClinical(user);
}

export function canManageTemplates(user: PermissionUser) {
  return user.role === "ADMIN" || canWorkClinical(user);
}

// Agenda: quem tem a aba Recepção (e o administrador) cuida da agenda de todos;
// o profissional vê e marca só na própria agenda.
export function canSeeAllAgendas(user: PermissionUser) {
  return hasReceptionTab(user);
}

export function canManageAgendaOf(user: PermissionUser, professionalId: string) {
  return canSeeAllAgendas(user) || user.id === professionalId;
}

// Só o profissional do agendamento inicia o atendimento a partir dele.
export function canStartFromAppointment(user: PermissionUser, appointment: { professionalId: string }) {
  return canWorkClinical(user) && appointment.professionalId === user.id;
}

// Recepção: quem confirma presença e marca chegada ou falta dos pacientes.
export function canUseReception(user: PermissionUser) {
  return hasReceptionTab(user);
}

// Financeiro: o administrador e o auxiliar administrativo veem tudo; a recepção lança cobranças
// e recebe pagamentos. Cada profissional vê o próprio repasse em "Meu financeiro".
export function canManageCharges(user: PermissionUser) {
  return canManageFinance(user) || user.role === "RECEPCAO";
}

export function canManageFinance(user: PermissionUser) {
  return user.role === "ADMIN" || user.role === "ADMINISTRATIVO";
}

export function canCancelCharge(user: PermissionUser, charge: { status: "PENDENTE" | "PAGO" | "CANCELADO" }) {
  if (charge.status === "CANCELADO") return false;
  return charge.status === "PENDENTE" ? canManageCharges(user) : canManageFinance(user);
}

export function canViewCommission(user: PermissionUser, professionalId: string) {
  return canManageFinance(user) || user.id === professionalId;
}

// Nota fiscal de serviço: quem lança cobranças anota o pedido do paciente, e o profissional também,
// na própria cobrança. Emite (anota o número) quem é o emissor: o financeiro, se a nota é da clínica,
// ou o profissional da cobrança, se ele emite como autônomo. O financeiro pode anotar por ele.
export function canRequestInvoice(user: PermissionUser, charge: { professionalId: string | null }) {
  return canManageCharges(user) || user.id === charge.professionalId;
}

export function canIssueInvoice(user: PermissionUser, invoice: { issuer: "CLINICA" | "PROFISSIONAL" }, charge: { professionalId: string | null }) {
  return canManageFinance(user) || (invoice.issuer === "PROFISSIONAL" && user.id === charge.professionalId);
}

// Modelos de atendimento: cada profissional cuida dos seus; o administrador cuida de todos,
// inclusive dos modelos da clínica (sem dono), que qualquer profissional pode usar.
export function canEditTemplate(user: PermissionUser, template: { ownerId: string | null }) {
  return user.role === "ADMIN" || (canWorkClinical(user) && template.ownerId === user.id);
}

export function canUseTemplate(user: PermissionUser, template: { ownerId: string | null }) {
  return template.ownerId === null || template.ownerId === user.id;
}
