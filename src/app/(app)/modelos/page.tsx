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
  const isAdmin = user.role === "ADMIN";

  // O administrador vê todos os modelos; o profissional vê os seus e os da clínica.
  const [rows, professionals] = await Promise.all([
    prisma.recordTemplate.findMany({
      where: isAdmin
        ? { clinicId: user.clinicId }
        : { clinicId: user.clinicId, OR: [{ ownerId: user.id }, { ownerId: null, active: true }] },
      orderBy: { name: "asc" },
    }),
    isAdmin
      ? prisma.user.findMany({
          where: { clinicId: user.clinicId, active: true, role: { not: "RECEPCAO" }, councilNumber: { not: null } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [],
  ]);
  const templates = rows.map((t) => ({ ...t, fields: t.fields as TemplateField[] }));
  const clinicTemplates = templates.filter((t) => t.ownerId === null);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Modelos de atendimento</h1>
        <p className="text-sm text-slate-500">
          {isAdmin
            ? "Cada profissional tem os seus modelos, com os campos do jeito que prefere. Os modelos da clínica ficam disponíveis para todos."
            : "Monte os formulários de atendimento do seu jeito. Só você vê e usa os seus modelos."}
        </p>
      </div>

      {isAdmin ? (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold">Modelos da clínica</h2>
            <p className="text-sm text-slate-500">Todos os profissionais podem usar e copiar para ajustar.</p>
            <TemplateList templates={clinicTemplates} canEdit professionals={professionals} empty="Nenhum modelo da clínica." />
          </section>
          {professionals.map((p) => (
            <section key={p.id} className="space-y-3">
              <h2 className="font-semibold">{p.name}</h2>
              <TemplateList
                templates={templates.filter((t) => t.ownerId === p.id)}
                canEdit
                professionals={professionals}
                empty="Ainda não criou modelos próprios."
              />
            </section>
          ))}
        </>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold">Meus modelos</h2>
            <TemplateList
              templates={templates.filter((t) => t.ownerId === user.id)}
              canEdit
              empty="Você ainda não tem modelos. Crie um abaixo ou copie um modelo da clínica."
            />
          </section>
          {clinicTemplates.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold">Modelos da clínica</h2>
              <p className="text-sm text-slate-500">Você pode usá-los como estão ou copiar para os seus e ajustar.</p>
              <TemplateList templates={clinicTemplates} canCopy />
            </section>
          )}
        </>
      )}

      <div className="card">
        <h2 className="mb-3 font-semibold">Novo modelo</h2>
        <TemplateForm professionals={isAdmin ? professionals : undefined} />
      </div>
    </div>
  );
}
