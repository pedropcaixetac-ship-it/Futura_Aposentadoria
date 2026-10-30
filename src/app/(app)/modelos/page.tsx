import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageTemplates } from "@/lib/permissions";
import type { TemplateField } from "@/lib/record";
import { TemplateForm } from "./template-form";
import { TemplateList } from "./template-list";

export default async function TemplatesPage() {
  const user = await requireUser();
  if (!canManageTemplates(user)) notFound();
  const templates = await prisma.recordTemplate.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" } });

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Modelos de atendimento</h1>
        <p className="text-sm text-slate-500">Cada especialidade pode ter o seu formulário de atendimento.</p>
      </div>
      <TemplateList templates={templates.map((t) => ({ ...t, fields: t.fields as TemplateField[] }))} />
      <div className="card">
        <h2 className="mb-3 font-semibold">Novo modelo</h2>
        <TemplateForm />
      </div>
    </div>
  );
}
