import { prisma } from "./db";
import { audit } from "./audit";
import type { EvolutionKind, Shift } from "@prisma/client";
import type { CurrentUser } from "./auth";
import type { TemplateField } from "./record";
import { findUsableTemplate } from "./templates";

const freeTextFields: TemplateField[] = [{ key: "evolucao", label: "Evolução", type: "textarea" }];

// Campos do atendimento: os do modelo escolhido ou, sem modelo, a evolução livre.
export function encounterFields(template: { fields: unknown } | null) {
  return (template?.fields as TemplateField[] | undefined) ?? freeTextFields;
}

// Abre um atendimento (rascunho) no prontuário, a partir do prontuário, da agenda ou da internação.
// Quem chama confere antes se o usuário pode atender e se o paciente é da clínica.
// evolution: no hospital, liga o atendimento à internação como evolução (médica, de enfermagem...).
export async function createEncounter(
  user: CurrentUser,
  patientId: string,
  templateId: string | null,
  evolution?: { admissionId: string; evolutionKind: EvolutionKind; shift: Shift | null },
) {
  // Só modelos da clínica ou do próprio profissional; modelos de colegas são recusados.
  const template = templateId ? await findUsableTemplate(user, templateId) : null;
  if (templateId && !template) throw new Error("Modelo não encontrado");

  const encounter = await prisma.encounter.create({
    data: {
      clinicId: user.clinicId,
      patientId,
      professionalId: user.id,
      templateId: template?.id,
      fields: encounterFields(template),
      ...evolution,
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
