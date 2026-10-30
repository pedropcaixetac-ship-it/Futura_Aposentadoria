import { prisma } from "./db";
import { audit } from "./audit";
import type { CurrentUser } from "./auth";
import type { TemplateField } from "./record";
import { findUsableTemplate } from "./templates";

const freeTextFields: TemplateField[] = [{ key: "evolucao", label: "Evolução", type: "textarea" }];

// Abre um atendimento (rascunho) no prontuário, a partir do prontuário ou da agenda.
// Quem chama confere antes se o usuário pode atender e se o paciente é da clínica.
export async function createEncounter(user: CurrentUser, patientId: string, templateId: string | null) {
  // Só modelos da clínica ou do próprio profissional; modelos de colegas são recusados.
  const template = templateId ? await findUsableTemplate(user, templateId) : null;
  if (templateId && !template) throw new Error("Modelo não encontrado");

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
