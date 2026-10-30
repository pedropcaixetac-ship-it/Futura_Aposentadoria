"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canEditTemplate, canManageTemplates, canUseTemplate, canViewClinical } from "@/lib/permissions";
import { slugifyKey, type TemplateField } from "@/lib/record";

export type TemplateState = { error: string; ok?: boolean };

// Cada linha do campo "fields" vira um campo do formulário.
// Uma linha terminando em "(curto)" vira um campo de uma linha só.
function parseFields(raw: string): TemplateField[] {
  const fields: TemplateField[] = [];
  const used = new Set<string>();
  for (const line of raw.split("\n")) {
    let label = line.trim();
    if (!label) continue;
    let type: TemplateField["type"] = "textarea";
    if (/\(curto\)$/i.test(label)) {
      type = "text";
      label = label.replace(/\s*\(curto\)$/i, "");
    }
    let key = slugifyKey(label) || "campo";
    while (used.has(key)) key += "_";
    used.add(key);
    fields.push({ key, label, type });
  }
  return fields;
}

// Dono do modelo: o profissional cria sempre para si; o administrador escolhe
// entre a clínica toda (vazio) ou um profissional.
async function resolveOwner(user: CurrentUser, formData: FormData, current: string | null) {
  if (user.role !== "ADMIN") return { ownerId: current ?? user.id };
  const ownerId = String(formData.get("ownerId") ?? "") || null;
  if (!ownerId) return { ownerId: null };
  const owner = await prisma.user.findFirst({ where: { id: ownerId, clinicId: user.clinicId } });
  if (!owner || !canViewClinical(owner)) return { error: "Profissional não encontrado." };
  return { ownerId };
}

export async function saveTemplate(_: TemplateState, formData: FormData): Promise<TemplateState> {
  const user = await requireUser();
  if (!canManageTemplates(user)) return { error: "Sem permissão." };

  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const fields = parseFields(String(formData.get("fields") ?? ""));
  if (!name) return { error: "Dê um nome ao modelo." };
  if (fields.length === 0) return { error: "Inclua pelo menos um campo." };

  if (id) {
    const existing = await prisma.recordTemplate.findFirst({ where: { id, clinicId: user.clinicId } });
    if (!existing || !canEditTemplate(user, existing)) return { error: "Modelo não encontrado." };
    const owner = await resolveOwner(user, formData, existing.ownerId);
    if ("error" in owner) return { error: owner.error! };
    await prisma.recordTemplate.update({
      where: { id },
      data: { name, fields, ownerId: owner.ownerId, active: formData.get("active") === "on" },
    });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "MODELO_ALTERADO", entity: "RecordTemplate", entityId: id });
  } else {
    const owner = await resolveOwner(user, formData, null);
    if ("error" in owner) return { error: owner.error! };
    const t = await prisma.recordTemplate.create({ data: { clinicId: user.clinicId, ownerId: owner.ownerId, name, fields } });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "MODELO_CRIADO", entity: "RecordTemplate", entityId: t.id });
  }
  revalidatePath("/modelos");
  return { error: "", ok: true };
}

// O profissional copia um modelo da clínica para os seus e depois ajusta do jeito dele.
export async function copyTemplate(id: string) {
  const user = await requireUser();
  if (!canViewClinical(user)) throw new Error("Sem permissão");
  const source = await prisma.recordTemplate.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!source || !canUseTemplate(user, source)) throw new Error("Modelo não encontrado");
  const t = await prisma.recordTemplate.create({
    data: { clinicId: user.clinicId, ownerId: user.id, name: source.name, fields: source.fields as TemplateField[] },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "MODELO_CRIADO", entity: "RecordTemplate", entityId: t.id });
  revalidatePath("/modelos");
}
