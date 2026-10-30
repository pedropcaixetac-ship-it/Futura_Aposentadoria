"use client";

import { useRef, useState } from "react";
import type { Diagnosis, TemplateField } from "@/lib/record";
import type { Snippet } from "@/app/(app)/textos-prontos/actions";
import { CidPicker } from "./cid-picker";
import { SnippetMenu } from "./snippet-menu";

type Props = {
  fields: TemplateField[];
  content: Record<string, string>;
  diagnoses: Diagnosis[];
  snippets: Snippet[];
  save: (formData: FormData) => Promise<void>;
  finalize: (formData: FormData) => Promise<void>;
};

export function EncounterEditor({ fields, content, diagnoses: initialDiagnoses, snippets: initialSnippets, save, finalize }: Props) {
  const [diagnoses, setDiagnoses] = useState(initialDiagnoses);
  const [snippets, setSnippets] = useState(initialSnippets);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  // Campo vazio recebe o texto pronto; campo já preenchido ganha o texto no final.
  const insert = (key: string, text: string) => {
    const el = inputs.current[key];
    if (!el) return;
    el.value = el.value.trim() ? `${el.value.trimEnd()}\n${text}` : text;
    el.focus();
  };

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
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="label mb-0" htmlFor={f.key}>{f.label}</label>
            <SnippetMenu
              fieldKey={f.key}
              snippets={snippets}
              currentText={() => inputs.current[f.key]?.value ?? ""}
              onPick={(text) => insert(f.key, text)}
              onCreated={(s) => setSnippets((prev) => [...prev, s])}
            />
          </div>
          {f.type === "text" ? (
            <input
              ref={(el) => { inputs.current[f.key] = el; }}
              className="input"
              id={f.key}
              name={`field_${f.key}`}
              defaultValue={content[f.key] ?? ""}
            />
          ) : (
            <textarea
              ref={(el) => { inputs.current[f.key] = el; }}
              className="input min-h-28"
              id={f.key}
              name={`field_${f.key}`}
              defaultValue={content[f.key] ?? ""}
            />
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
