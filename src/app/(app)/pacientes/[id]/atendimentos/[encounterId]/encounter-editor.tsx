"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Diagnosis, TemplateField } from "@/lib/record";
import type { Vitals } from "@/lib/vitals";
import type { Snippet } from "@/app/(app)/textos-prontos/actions";
import { CidPicker } from "./cid-picker";
import { ConsultationTimer } from "./consultation-timer";
import { DictationButton } from "./dictation-button";
import { SnippetMenu } from "./snippet-menu";
import { VitalsInput } from "./vitals-input";

const AUTOSAVE_DELAY_MS = 1000;

type SaveState = { kind: "idle" } | { kind: "dirty" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error" };

export type LastEncounter = {
  when: string;
  professionalName: string;
  fields: TemplateField[];
  content: Record<string, string>;
  diagnoses: Diagnosis[];
};

type Props = {
  patient: { name: string; ageLine: string | null; insurance: string | null; allergies: string | null };
  startedAt: string;
  heading: string;
  fields: TemplateField[];
  content: Record<string, string>;
  diagnoses: Diagnosis[];
  vitals: Vitals | null;
  snippets: Snippet[];
  lastEncounter: LastEncounter | null;
  autosave: (formData: FormData) => Promise<string>;
  reviewHref: string;
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
  lastEncounter,
  autosave,
  reviewHref,
}: Props) {
  const router = useRouter();
  const [diagnoses, setDiagnoses] = useState(initialDiagnoses);
  const [snippets, setSnippets] = useState(initialSnippets);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const inputs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaving = useRef(false);

  const saveNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (!formRef.current || leaving.current) return false;
    setSaveState({ kind: "saving" });
    try {
      const at = await autosave(new FormData(formRef.current));
      setSaveState({ kind: "saved", at: new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) });
      return true;
    } catch {
      setSaveState({ kind: "error" });
      return false;
    }
  }, [autosave]);

  // "Avançar" salva tudo antes de ir para a revisão, onde o atendimento é finalizado.
  const advance = async () => {
    if (!(await saveNow())) return;
    leaving.current = true;
    router.push(reviewHref);
  };

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
      if (leaving.current) return;
      if (saveState.kind === "dirty" || saveState.kind === "saving" || saveState.kind === "error") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState.kind]);

  // Campo vazio recebe o texto; campo já preenchido ganha o texto no final.
  const insert = (key: string, text: string, separator = "\n") => {
    const el = inputs.current[key];
    if (!el || !text) return;
    el.value = el.value.trim() ? `${el.value.trimEnd()}${separator}${text}` : text;
    el.focus();
    markDirty();
  };

  // Traz o texto da última consulta finalizada. Campos com o mesmo nome são copiados um a um;
  // o que não tiver campo correspondente vai para o primeiro campo, com o título original.
  const copyLast = () => {
    if (!lastEncounter) return;
    const filled = fields.some((f) => inputs.current[f.key]?.value.trim());
    if (filled && !confirm("Os campos já preenchidos serão substituídos pelo texto da última consulta. Continuar?")) return;

    const keys = new Set(fields.map((f) => f.key));
    const leftovers = lastEncounter.fields
      .filter((f) => !keys.has(f.key) && lastEncounter.content[f.key]?.trim())
      .map((f) => `${f.label}: ${lastEncounter.content[f.key].trim()}`);
    fields.forEach((f, i) => {
      const el = inputs.current[f.key];
      if (!el) return;
      const parts = [lastEncounter.content[f.key]?.trim() ?? "", ...(i === 0 ? leftovers : [])].filter(Boolean);
      el.value = parts.join("\n");
    });
    if (lastEncounter.diagnoses.length) setDiagnoses(lastEncounter.diagnoses);
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
      onSubmit={(e) => e.preventDefault()}
      onInput={markDirty}
      // Enter num campo de uma linha não pode enviar o formulário sem querer.
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      className="space-y-4"
    >
      <div className="sticky top-[3.5rem] z-30 rounded-b-lg md:top-0 bg-marinho-900 px-4 py-3 text-white shadow-md">
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
            <button type="button" onClick={advance} className="btn bg-dourado-500 text-marinho-950 hover:bg-dourado-400">
              Avançar →
            </button>
          </div>
        </div>
        {patient.allergies && (
          <p className="mt-2 rounded bg-red-600 px-2 py-1 text-sm font-semibold text-white">⚠ Alergias: {patient.allergies}</p>
        )}
      </div>

      <VitalsInput initial={vitals} />

      <div className="card space-y-4">
        {lastEncounter && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-marinho-50 px-3 py-2 text-sm">
            <span className="text-slate-600">
              Última consulta: {lastEncounter.when} · {lastEncounter.professionalName}
            </span>
            <button type="button" onClick={copyLast} className="btn-secondary px-3 py-1 text-xs">
              ⧉ Copiar da última consulta
            </button>
          </div>
        )}
        {fields.map((f) => (
          <div key={f.key}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label mb-0" htmlFor={f.key}>{f.label}</label>
              <span className="flex items-center gap-2">
                <DictationButton onText={(text) => insert(f.key, text, " ")} />
                <SnippetMenu
                  fieldKey={f.key}
                  snippets={snippets}
                  currentText={() => inputs.current[f.key]?.value ?? ""}
                  onPick={(text) => insert(f.key, text)}
                  onCreated={(s) => setSnippets((prev) => [...prev, s])}
                />
              </span>
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
