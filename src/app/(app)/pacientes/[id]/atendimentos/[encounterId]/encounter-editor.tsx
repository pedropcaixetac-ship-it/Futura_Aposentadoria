"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Diagnosis, TemplateField } from "@/lib/record";
import type { Vitals } from "@/lib/vitals";
import type { Snippet } from "@/app/(app)/textos-prontos/actions";
import { CidPicker } from "./cid-picker";
import { ConsultationTimer } from "./consultation-timer";
import { SnippetMenu } from "./snippet-menu";
import { VitalsInput } from "./vitals-input";

const AUTOSAVE_DELAY_MS = 3000;

type SaveState = { kind: "idle" } | { kind: "dirty" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error" };

type Props = {
  patient: { name: string; ageLine: string | null; insurance: string | null; allergies: string | null };
  startedAt: string;
  heading: string;
  fields: TemplateField[];
  content: Record<string, string>;
  diagnoses: Diagnosis[];
  vitals: Vitals | null;
  snippets: Snippet[];
  autosave: (formData: FormData) => Promise<string>;
  finalize: (formData: FormData) => Promise<void>;
};

export function EncounterEditor({
  patient,
  startedAt,
  heading,
  fields,
  content,
  diagnoses: initialDiagnoses,
  vitals,
  snippets: initialSnippets,
  autosave,
  finalize,
}: Props) {
  const [diagnoses, setDiagnoses] = useState(initialDiagnoses);
  const [snippets, setSnippets] = useState(initialSnippets);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const inputs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizing = useRef(false);

  const saveNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (!formRef.current || finalizing.current) return;
    setSaveState({ kind: "saving" });
    try {
      const at = await autosave(new FormData(formRef.current));
      setSaveState({ kind: "saved", at: new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) });
    } catch {
      setSaveState({ kind: "error" });
    }
  }, [autosave]);

  // Cada alteração agenda um salvamento automático alguns segundos depois da última tecla.
  const markDirty = useCallback(() => {
    setSaveState({ kind: "dirty" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, AUTOSAVE_DELAY_MS);
  }, [saveNow]);

  // O campo escondido dos diagnósticos só muda depois do render, então salvamos a partir daqui.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    markDirty();
  }, [diagnoses, markDirty]);

  // Avisa antes de fechar a aba com alterações ainda não salvas.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState.kind === "dirty" || saveState.kind === "saving" || saveState.kind === "error") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState.kind]);

  // Campo vazio recebe o texto pronto; campo já preenchido ganha o texto no final.
  const insert = (key: string, text: string) => {
    const el = inputs.current[key];
    if (!el) return;
    el.value = el.value.trim() ? `${el.value.trimEnd()}\n${text}` : text;
    el.focus();
    markDirty();
  };

  const status = {
    idle: <span className="text-marinho-100">Salvamento automático ligado</span>,
    dirty: <span className="text-marinho-100">Alterações não salvas…</span>,
    saving: <span className="text-marinho-100">Salvando…</span>,
    saved: saveState.kind === "saved" && <span className="text-dourado-300">✓ Salvo às {saveState.at}</span>,
    error: <span className="font-medium text-red-300">Não foi possível salvar. Verifique a internet.</span>,
  }[saveState.kind];

  return (
    <form
      ref={formRef}
      action={finalize}
      onInput={markDirty}
      // Enter num campo de uma linha não pode finalizar o atendimento sem querer.
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      className="space-y-4"
    >
      <div className="sticky top-0 z-30 rounded-b-lg bg-marinho-900 px-4 py-3 text-white shadow-md">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-dourado-300">{heading}</p>
            <p className="truncate text-lg font-semibold">
              {patient.name}
              {patient.ageLine && <span className="font-normal text-marinho-100"> · {patient.ageLine}</span>}
              {patient.insurance && <span className="font-normal text-marinho-100"> · {patient.insurance}</span>}
            </p>
          </div>
          <ConsultationTimer startedAt={startedAt} />
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="text-xs" aria-live="polite">{status}</span>
            <button type="button" onClick={saveNow} className="btn border border-marinho-400 text-white hover:bg-marinho-800">
              Salvar
            </button>
            <button
              className="btn bg-dourado-500 text-marinho-950 hover:bg-dourado-400"
              onClick={(e) => {
                if (!confirm("Depois de finalizado, o atendimento não poderá mais ser alterado, apenas complementado por adendo. Finalizar?")) {
                  e.preventDefault();
                  return;
                }
                finalizing.current = true;
                if (timer.current) clearTimeout(timer.current);
              }}
            >
              Finalizar atendimento
            </button>
          </div>
        </div>
        {patient.allergies && (
          <p className="mt-2 rounded bg-red-600 px-2 py-1 text-sm font-semibold text-white">⚠ Alergias: {patient.allergies}</p>
        )}
      </div>

      <VitalsInput initial={vitals} />

      <div className="card space-y-4">
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
      </div>
    </form>
  );
}
