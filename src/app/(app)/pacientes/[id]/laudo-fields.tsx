"use client";

import { useEffect, useState } from "react";
import { laudoSections, type LaudoField, type LaudoType, type LaudoValues } from "@/lib/laudos";

// Tailwind só gera as classes escritas por inteiro no código.
const SPAN = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
  5: "sm:col-span-5",
  6: "sm:col-span-6",
} as const;

type Found = { code: string; text: string };

// Campo com busca: digita código ou nome e escolhe da lista; fica só o código.
function LookupInput({
  name,
  defaultValue,
  required,
  search,
  placeholder,
  onPick,
}: {
  name: string;
  defaultValue: string;
  required?: boolean;
  search: (q: string, signal: AbortSignal) => Promise<Found[]>;
  placeholder: string;
  onPick?: (found: Found) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [results, setResults] = useState<Found[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (!open || q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setResults(await search(q, controller.signal));
      } catch {
        // busca cancelada porque a pessoa continuou digitando
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, open, search]);

  return (
    <div className="relative">
      <input
        className="input"
        id={name}
        name={name}
        value={value}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-[min(28rem,85vw)] overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {results.map((r) => (
            <li key={r.code}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setValue(r.code);
                  setOpen(false);
                  onPick?.(r);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-marinho-50"
              >
                <strong>{r.code}</strong> {r.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T[]> {
  const res = await fetch(url, { signal });
  return res.ok ? res.json() : [];
}

const searchCid = async (q: string, signal: AbortSignal) =>
  (await getJson<{ code: string; description: string }>(`/api/cid?q=${encodeURIComponent(q)}`, signal)).map((r) => ({ code: r.code, text: r.description }));

const searchProcedure = async (q: string, signal: AbortSignal) =>
  (await getJson<{ code: string; name: string }>(`/api/sigtap?q=${encodeURIComponent(q)}`, signal)).map((r) => ({ code: r.code, text: r.name }));

// Ao escolher o procedimento, o nome vai para o campo ao lado (que continua editável).
function fillName(nameKey: string | undefined, name: string) {
  const input = nameKey ? (document.getElementById(`laudo_${nameKey}`) as HTMLInputElement | null) : null;
  if (input) input.value = name;
}

function Field({ field, value }: { field: LaudoField; value: string }) {
  const name = `laudo_${field.key}`;
  if (field.kind === "cid") {
    return <LookupInput name={name} defaultValue={value} required={field.required} search={searchCid} placeholder="Código ou nome" />;
  }
  if (field.kind === "procedure") {
    return (
      <LookupInput
        name={name}
        defaultValue={value}
        required={field.required}
        search={searchProcedure}
        placeholder="Busque por nome ou código"
        onPick={(p) => fillName(field.nameKey, p.text)}
      />
    );
  }
  if (field.kind === "textarea") {
    return <textarea className="input" id={name} name={name} rows={3} maxLength={field.max} defaultValue={value} required={field.required} />;
  }
  if (field.kind === "select") {
    return (
      <select className="input" id={name} name={name} defaultValue={value} required={field.required}>
        <option value="">—</option>
        {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input
      className="input"
      id={name}
      name={name}
      type={field.kind === "date" ? "date" : "text"}
      maxLength={field.max}
      defaultValue={value}
      required={field.required}
    />
  );
}

// Campos de um laudo do SUS, já com o que o sistema sabe do paciente, da clínica e do profissional.
export function LaudoFields({ type, defaults }: { type: LaudoType; defaults: LaudoValues }) {
  return (
    <div className="space-y-4">
      {laudoSections[type].map((section) => (
        <fieldset key={section.title} className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-marinho-800">{section.title}</legend>
          {section.hint && <p className="mb-2 text-xs text-slate-500">{section.hint}</p>}
          <div className="grid gap-3 sm:grid-cols-6">
            {section.fields.map((f) => (
              <div key={f.key} className={SPAN[f.span ?? 6]}>
                <label className="label" htmlFor={`laudo_${f.key}`}>
                  {f.label}
                  {f.required && <span className="text-red-600"> *</span>}
                </label>
                <Field field={f} value={defaults[f.key] ?? ""} />
                {f.hint && <p className="mt-0.5 text-xs text-slate-500">{f.hint}</p>}
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="text-xs text-slate-500">
        <span className="text-red-600">*</span> obrigatório. Os campos de autorização ficam em branco para o órgão autorizador.
      </p>
    </div>
  );
}
