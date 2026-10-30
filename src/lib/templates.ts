import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { canUseTemplate } from "./permissions";

// Modelos que o profissional pode escolher ao abrir um atendimento:
// os dele e os da clínica. Os de outros profissionais não aparecem.
function usableWhere(user: CurrentUser) {
  return { clinicId: user.clinicId, active: true, OR: [{ ownerId: user.id }, { ownerId: null }] };
}

export async function listUsableTemplates(user: CurrentUser) {
  const templates = await prisma.recordTemplate.findMany({ where: usableWhere(user), orderBy: { name: "asc" } });
  return {
    mine: templates.filter((t) => t.ownerId === user.id),
    clinic: templates.filter((t) => t.ownerId === null),
  };
}

export async function findUsableTemplate(user: CurrentUser, id: string) {
  const template = await prisma.recordTemplate.findFirst({ where: { id, clinicId: user.clinicId, active: true } });
  return template && canUseTemplate(user, template) ? template : null;
}
