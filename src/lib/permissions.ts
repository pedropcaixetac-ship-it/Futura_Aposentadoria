import type { Role } from "@prisma/client";

export type PermissionUser = {
  id: string;
  role: Role;
  councilNumber: string | null;
};

// Só profissionais de saúde com registro em conselho veem o conteúdo clínico.
// Recepção e administradores sem registro veem apenas o cadastro.
export function canViewClinical(user: PermissionUser) {
  return user.role !== "RECEPCAO" && !!user.councilNumber;
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
  return user.role === "ADMIN" || canViewClinical(user);
}

// Financeiro: o administrador vê tudo; a recepção lança cobranças e recebe pagamentos;
// cada profissional vê apenas o próprio repasse.
export function canManageCharges(user: PermissionUser) {
  return user.role === "ADMIN" || user.role === "RECEPCAO";
}

export function canManageFinance(user: PermissionUser) {
  return user.role === "ADMIN";
}

export function canCancelCharge(user: PermissionUser, charge: { status: "PENDENTE" | "PAGO" | "CANCELADO" }) {
  if (charge.status === "CANCELADO") return false;
  return charge.status === "PENDENTE" ? canManageCharges(user) : canManageFinance(user);
}

export function canViewCommission(user: PermissionUser, professionalId: string) {
  return canManageFinance(user) || user.id === professionalId;
}
