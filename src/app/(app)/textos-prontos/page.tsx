import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canViewClinical } from "@/lib/permissions";
import type { TemplateField } from "@/lib/record";
import { listUsableTemplates } from "@/lib/templates";
import { createSnippetFromForm, deleteSnippet } from "./actions";

export default async function SnippetsPage() {
  const user = await requireUser();
  if (!canViewClinical(user)) notFound();

  const [snippets, templates] = await Promise.all([
    prisma.textSnippet.findMany({ where: { ownerId: user.id }, orderBy: [{ fieldKey: "asc" }, { title: "asc" }] }),
    listUsableTemplates(user),
  ]);

  // Lista de campos existentes nos modelos que o profissional usa, sem repetição.
  const fieldLabels = new Map<string, string>([["evolucao", "Evolução"]]);
  for (const t of [...templates.mine, ...templates.clinic]) for (const f of t.fields as TemplateField[]) fieldLabels.set(f.key, f.label);
  const fields = [...fieldLabels].sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Meus textos prontos</h1>
        <p className="text-sm text-slate-500">
          Textos que você usa com frequência. No atendimento, clique em &quot;Usar modelo&quot; ao lado do campo para inseri-los.
          Só você vê os seus textos.
        </p>
      </div>

      <ul className="space-y-3">
        {snippets.map((s) => (
          <li key={s.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{s.title}</p>
                <p className="text-xs text-dourado-700">{s.fieldKey ? fieldLabels.get(s.fieldKey) ?? s.fieldKey : "Todos os campos"}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{s.text}</p>
              </div>
              <form action={deleteSnippet.bind(null, s.id)}>
                <button className="text-sm text-slate-400 hover:text-red-600">Excluir</button>
              </form>
            </div>
          </li>
        ))}
        {snippets.length === 0 && <li className="card text-sm text-slate-400">Você ainda não tem textos prontos.</li>}
      </ul>

      <form action={createSnippetFromForm} className="card space-y-3">
        <h2 className="font-semibold">Novo texto pronto</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="title">Nome</label>
            <input className="input" id="title" name="title" placeholder="Ex.: Exame físico normal" required />
          </div>
          <div>
            <label className="label" htmlFor="fieldKey">Aparece no campo</label>
            <select className="input" id="fieldKey" name="fieldKey" defaultValue="">
              <option value="">Todos os campos</option>
              {fields.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="text">Texto</label>
          <textarea className="input min-h-28" id="text" name="text" required />
        </div>
        <button className="btn-primary">Salvar texto pronto</button>
      </form>
    </div>
  );
}
