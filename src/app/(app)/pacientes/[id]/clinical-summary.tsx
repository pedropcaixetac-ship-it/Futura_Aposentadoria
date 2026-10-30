"use client";

import { useActionState, useState } from "react";
import type { FormState } from "../actions";

type Summary = {
  allergies: string | null;
  currentMedications: string | null;
  personalHistory: string | null;
  familyHistory: string | null;
};

const items: { key: keyof Summary; label: string }[] = [
  { key: "allergies", label: "Alergias" },
  { key: "currentMedications", label: "Medicamentos em uso" },
  { key: "personalHistory", label: "Antecedentes pessoais" },
  { key: "familyHistory", label: "Antecedentes familiares" },
];

export function ClinicalSummary({
  summary,
  action,
  compact = false,
}: {
  summary: Summary;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  // Uma coluna só, para caber na lateral da consulta.
  compact?: boolean;
}) {
  const grid = compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2";
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const result = await action(prev, fd);
    if (!result.error) setEditing(false);
    return result;
  }, { error: "" });

  if (!editing) {
    return (
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Resumo clínico</h2>
          <button onClick={() => setEditing(true)} className="no-print text-sm text-marinho-700 hover:underline">Editar</button>
        </div>
        <dl className={grid}>
          {items.map(({ key, label }) => (
            <div key={key}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className={`whitespace-pre-wrap text-sm ${key === "allergies" && summary.allergies ? "font-semibold text-red-700" : ""}`}>
                {summary[key] || <span className="text-slate-400">Não informado</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-3">
      <h2 className="font-semibold">Resumo clínico</h2>
      <div className={grid}>
        {items.map(({ key, label }) => (
          <div key={key}>
            <label className="label" htmlFor={key}>{label}</label>
            <textarea className="input" id={key} name={key} rows={3} defaultValue={summary[key] ?? ""} />
          </div>
        ))}
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending}>Salvar</button>
        <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancelar</button>
      </div>
    </form>
  );
}
