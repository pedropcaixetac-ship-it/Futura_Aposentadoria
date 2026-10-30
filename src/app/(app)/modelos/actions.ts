"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canManageTemplates } from "@/lib/permissions";
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

export async function saveTemplate(_: TemplateState, formData: FormData): Promise<TemplateState> {
  const user = await requireUser();
  if (!canManageTemplates(user)) return { error: "Sem permissão." };

  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const specialty = String(formData.get("specialty") ?? "").trim() || null;
  const fields = parseFields(String(formData.get("fields") ?? ""));
  if (!name) return { error: "Dê um nome ao modelo." };
  if (fields.length === 0) return { error: "Inclua pelo menos um campo." };

  if (id) {
    const { count } = await prisma.recordTemplate.updateMany({
      where: { id, clinicId: user.clinicId },
      data: { name, specialty, fields, active: formData.get("active") === "on" },
    });
    if (count === 0) return { error: "Modelo não encontrado." };
    await audit({ clinicId: user.clinicId, userId: user.id, action: "MODELO_ALTERADO", entity: "RecordTemplate", entityId: id });
  } else {
    const t = await prisma.recordTemplate.create({ data: { clinicId: user.clinicId, name, specialty, fields } });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "MODELO_CRIADO", entity: "RecordTemplate", entityId: t.id });
  }
  revalidatePath("/modelos");
  return { error: "", ok: true };
}
