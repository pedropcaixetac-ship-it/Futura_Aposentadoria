import { prisma } from "./db";
import { audit } from "./audit";
import type { CurrentUser } from "./auth";
import type { TemplateField } from "./record";

const freeTextFields: TemplateField[] = [{ key: "evolucao", label: "Evolução", type: "textarea" }];

// Abre um atendimento (rascunho) no prontuário, a partir do prontuário ou da agenda.
// Quem chama confere antes se o usuário pode atender e se o paciente é da clínica.
export async function createEncounter(user: CurrentUser, patientId: string, templateId: string | null) {
  const template = templateId
    ? await prisma.recordTemplate.findFirst({ where: { id: templateId, clinicId: user.clinicId } })
    : null;

  const encounter = await prisma.encounter.create({
    data: {
      clinicId: user.clinicId,
      patientId,
      professionalId: user.id,
      templateId: template?.id,
      fields: (template?.fields as TemplateField[] | undefined) ?? freeTextFields,
    },
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "ATENDIMENTO_INICIADO",
    entity: "Encounter",
    entityId: encounter.id,
    patientId,
  });
  return encounter;
}
