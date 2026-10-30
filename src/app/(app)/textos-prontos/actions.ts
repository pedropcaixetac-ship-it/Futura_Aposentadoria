"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canWorkClinical } from "@/lib/permissions";

export type Snippet = { id: string; fieldKey: string | null; title: string; text: string };

// Textos prontos são pessoais: cada profissional só vê e altera os seus.
async function requireProfessional() {
  const user = await requireUser("textos-prontos");
  if (!canWorkClinical(user)) throw new Error("Sem permissão");
  return user;
}

export async function createSnippet(input: { fieldKey: string | null; title: string; text: string }): Promise<Snippet> {
  const user = await requireProfessional();
  const title = input.title.trim().slice(0, 80);
  const text = input.text.trim();
  if (!title || !text) throw new Error("Informe o nome e o texto");
  const snippet = await prisma.textSnippet.create({
    data: { ownerId: user.id, fieldKey: input.fieldKey || null, title, text },
    select: { id: true, fieldKey: true, title: true, text: true },
  });
  revalidatePath("/textos-prontos");
  return snippet;
}

export async function createSnippetFromForm(formData: FormData) {
  await createSnippet({
    fieldKey: String(formData.get("fieldKey") ?? "") || null,
    title: String(formData.get("title") ?? ""),
    text: String(formData.get("text") ?? ""),
  });
}

export async function deleteSnippet(id: string) {
  const user = await requireProfessional();
  await prisma.textSnippet.deleteMany({ where: { id, ownerId: user.id } });
  revalidatePath("/textos-prontos");
}
