"use client";

import { useState } from "react";
import { bmi, bmiLabel, vitalFields, type Vitals } from "@/lib/vitals";

export function VitalsInput({ initial }: { initial: Vitals | null }) {
  const [weight, setWeight] = useState(initial?.peso?.toString() ?? "");
  const [height, setHeight] = useState(initial?.altura?.toString() ?? "");
  const imc = bmi({ peso: Number(weight.replace(",", ".")) || undefined, altura: Number(height.replace(",", ".")) || undefined });

  return (
    <fieldset className="card space-y-3">
      <legend className="sr-only">Sinais vitais</legend>
      <h2 className="font-semibold">Sinais vitais</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {vitalFields.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`vital_${f.key}`}>
              {f.label} <span className="text-slate-400">({f.unit})</span>
            </label>
            <input
              className="input"
              id={`vital_${f.key}`}
              name={`vital_${f.key}`}
              inputMode="decimal"
              defaultValue={f.key === "peso" || f.key === "altura" ? undefined : initial?.[f.key]?.toString() ?? ""}
              value={f.key === "peso" ? weight : f.key === "altura" ? height : undefined}
              onChange={
                f.key === "peso" ? (e) => setWeight(e.target.value) : f.key === "altura" ? (e) => setHeight(e.target.value) : undefined
              }
            />
          </div>
        ))}
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">IMC (automático)</span>
          <div className="rounded-md border border-dourado-300 bg-dourado-100 px-3 py-2 text-sm">
            {imc ? (
              <>
                <strong>{imc.toLocaleString("pt-BR")}</strong> <span className="text-xs text-slate-600">{bmiLabel(imc)}</span>
              </>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
        </div>
      </div>
    </fieldset>
  );
}
