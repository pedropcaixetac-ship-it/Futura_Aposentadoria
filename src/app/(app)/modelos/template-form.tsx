"use client";

import { useActionState } from "react";
import type { TemplateField } from "@/lib/record";
import { saveTemplate } from "./actions";

export type Professional = { id: string; name: string };

type Props = {
  template?: { id: string; name: string; ownerId: string | null; fields: TemplateField[]; active: boolean };
  // Só o administrador recebe a lista, para escolher de quem é o modelo.
  professionals?: Professional[];
  onDone?: () => void;
};

export function TemplateForm({ template, professionals, onDone }: Props) {
  const [state, action, pending] = useActionState(async (prev: { error: string }, fd: FormData) => {
    const result = await saveTemplate(prev, fd);
    if (result.ok) onDone?.();
    return result;
  }, { error: "" });

  const fieldsText = template?.fields.map((f) => (f.type === "text" ? `${f.label} (curto)` : f.label)).join("\n") ?? "";

  return (
    <form action={action} className="space-y-3" key={template?.id ?? "novo"}>
      {template && <input type="hidden" name="id" value={template.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Nome do modelo</label>
          <input className="input" name="name" defaultValue={template?.name} required />
        </div>
        {professionals && (
          <div>
            <label className="label">De quem é o modelo</label>
            <select className="input" name="ownerId" defaultValue={template?.ownerId ?? ""}>
              <option value="">Toda a clínica</option>
              {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="label">Campos (um por linha)</label>
        <textarea className="input font-mono" name="fields" rows={6} defaultValue={fieldsText} required />
        <p className="mt-1 text-xs text-slate-500">
          Ex.: &quot;Queixa principal&quot;. Para um campo de uma linha só, termine com &quot;(curto)&quot;, como &quot;Pressão arterial (curto)&quot;.
          Alterar um modelo não muda atendimentos já registrados.
        </p>
      </div>
      {template && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={template.active} /> Ativo
        </label>
      )}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{template ? "Salvar modelo" : "Criar modelo"}</button>
    </form>
  );
}
