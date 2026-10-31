"use client";

import { useRef, useState } from "react";
import type { DocumentType } from "@prisma/client";
import { documentDefaultBody, documentTypeLabel, documentTypes } from "@/lib/documents";
import { isLaudo, laudoTitle, type LaudoType, type LaudoValues } from "@/lib/laudos";
import { LaudoFields } from "../../laudo-fields";
import { addToPrescription } from "@/lib/medicamentos";
import { MedicationPicker } from "../../../../prescricao/medication-search";

export function DocumentForm({
  issue,
  laudoDefaults,
  types = documentTypes,
}: {
  issue: (formData: FormData) => Promise<{ error?: string } | void>;
  // Respostas iniciais de cada laudo do SUS (dados do paciente, da clínica e do profissional).
  laudoDefaults: Record<LaudoType, LaudoValues>;
  types?: readonly DocumentType[];
}) {
  const [type, setType] = useState<DocumentType>(types[0]);
  const [body, setBody] = useState(documentDefaultBody[types[0]]);
  const [error, setError] = useState<string | null>(null);
  // Muda a cada emissão para o laudo voltar aos dados iniciais.
  const [round, setRound] = useState(0);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Põe o medicamento escolhido na receita e leva o cursor para a linha de baixo, onde vai a posologia.
  function addMedication(m: Parameters<typeof addToPrescription>[1]) {
    const next = addToPrescription(body, m);
    setBody(next);
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
      el.scrollTop = el.scrollHeight;
    });
  }

  // Ao trocar o tipo, troca o texto inicial, a não ser que o profissional já tenha escrito algo.
  function changeType(next: DocumentType) {
    if (body.trim() === documentDefaultBody[type].trim()) setBody(documentDefaultBody[next]);
    setType(next);
    setError(null);
  }

  const laudo = isLaudo(type);
  const label = laudo ? type : documentTypeLabel[type].toLowerCase();

  return (
    <form
      action={async (formData) => {
        const result = await issue(formData);
        if (result?.error) {
          setError(result.error);
          return;
        }
        setError(null);
        setBody(documentDefaultBody[type]);
        setRound((r) => r + 1);
      }}
      className="space-y-2"
    >
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <label
            key={t}
            title={isLaudo(t) ? laudoTitle[t] : undefined}
            className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
              t === type ? "border-marinho-700 bg-marinho-700 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <input type="radio" name="type" value={t} checked={t === type} onChange={() => changeType(t)} className="sr-only" />
            {documentTypeLabel[t]}
          </label>
        ))}
      </div>
      {laudo ? (
        <>
          <p className="text-sm font-medium text-marinho-800">{laudoTitle[type]}</p>
          <LaudoFields key={`${type}-${round}`} type={type} defaults={laudoDefaults[type]} />
        </>
      ) : (
        <>
          {type === "RECEITA" && <MedicationPicker onPick={addMedication} />}
          <textarea ref={bodyRef} className="input" name="body" rows={6} required value={body} onChange={(e) => setBody(e.target.value)} />
        </>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-slate-500">
        Depois de emitido, o documento não pode ser alterado. Para corrigir, emita um novo.
      </p>
      <button className="btn-primary">Emitir {label}</button>
    </form>
  );
}
