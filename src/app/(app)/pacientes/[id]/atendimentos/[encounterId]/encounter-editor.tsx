"use client";

import { useState } from "react";
import type { Diagnosis, TemplateField } from "@/lib/record";
import { CidPicker } from "./cid-picker";

type Props = {
  fields: TemplateField[];
  content: Record<string, string>;
  diagnoses: Diagnosis[];
  save: (formData: FormData) => Promise<void>;
  finalize: (formData: FormData) => Promise<void>;
};

export function EncounterEditor({ fields, content, diagnoses: initialDiagnoses, save, finalize }: Props) {
  const [diagnoses, setDiagnoses] = useState(initialDiagnoses);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  return (
    <form
      action={async (fd) => {
        await save(fd);
        setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      }}
      className="card space-y-4"
    >
      {fields.map((f) => (
        <div key={f.key}>
          <label className="label" htmlFor={f.key}>{f.label}</label>
          {f.type === "text" ? (
            <input className="input" id={f.key} name={`field_${f.key}`} defaultValue={content[f.key] ?? ""} />
          ) : (
            <textarea className="input min-h-28" id={f.key} name={`field_${f.key}`} defaultValue={content[f.key] ?? ""} />
          )}
        </div>
      ))}

      <div>
        <span className="label">Diagnósticos (CID-10)</span>
        <CidPicker value={diagnoses} onChange={setDiagnoses} />
        <input type="hidden" name="diagnoses" value={JSON.stringify(diagnoses)} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <button className="btn-secondary">Salvar rascunho</button>
        <button
          formAction={finalize}
          className="btn-primary"
          onClick={(e) => {
            if (!confirm("Depois de finalizado, o atendimento não poderá mais ser alterado, apenas complementado por adendo. Finalizar?")) {
              e.preventDefault();
            }
          }}
        >
          Finalizar atendimento
        </button>
        {savedAt && <span className="text-sm text-slate-500">Rascunho salvo às {savedAt}</span>}
      </div>
    </form>
  );
}
