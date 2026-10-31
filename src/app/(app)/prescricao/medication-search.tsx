"use client";

import { useEffect, useRef, useState } from "react";
import { medicationLabel, type Medication } from "@/lib/medicamentos";

// Busca de medicamento enquanto se digita, igual à do CID.
// Mostra as opções a partir de 2 letras.
function useMedicationSearch(query: string) {
  const [results, setResults] = useState<Medication[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/medicamentos?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) setResults(await res.json());
      } catch {
        // busca cancelada porque a pessoa continuou digitando
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  return [results, setResults] as const;
}

function ResultList({ results, onPick }: { results: Medication[]; onPick: (m: Medication) => void }) {
  if (results.length === 0) return null;
  return (
    <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
      {results.map((m) => (
        <li key={`${m.name}|${m.presentation}|${m.route}`}>
          <button
            type="button"
            // mousedown para escolher antes de o campo perder o foco e a lista sumir
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(m);
            }}
            className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-marinho-50"
          >
            <span>
              <strong>{m.name}</strong> {m.presentation}
            </span>
            <span className="shrink-0 text-xs text-slate-500">
              {m.inPharmacy ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">na farmácia</span> : m.route}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Campo "Medicamento ou cuidado" da prescrição do hospital. Continua aceitando texto livre
// (cuidados como "Decúbito elevado 30°"), mas sugere medicamentos enquanto o médico digita.
// Ao escolher, preenche também a via, se ela ainda estiver em branco.
export function MedicationInput({ name, id, routeFieldId, placeholder }: { name: string; id: string; routeFieldId?: string; placeholder?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useMedicationSearch(open ? query : "");

  function pick(m: Medication) {
    if (inputRef.current) inputRef.current.value = medicationLabel(m);
    const route = routeFieldId ? (document.getElementById(routeFieldId) as HTMLSelectElement | null) : null;
    if (route && !route.value && m.route && [...route.options].some((o) => o.value === m.route)) route.value = m.route;
    setOpen(false);
    setResults([]);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className="input"
        id={id}
        name={name}
        required
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && <ResultList results={results} onPick={pick} />}
    </div>
  );
}

// Busca para a receita da clínica: ao escolher, o medicamento entra como próximo item da receita.
export function MedicationPicker({ onPick }: { onPick: (m: Medication) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useMedicationSearch(query);
  return (
    <div className="relative">
      <input
        className="input"
        value={query}
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar medicamento para a receita (ex.: amoxicilina, dipirona)"
      />
      <ResultList
        results={results}
        onPick={(m) => {
          onPick(m);
          setQuery("");
          setResults([]);
        }}
      />
    </div>
  );
}
