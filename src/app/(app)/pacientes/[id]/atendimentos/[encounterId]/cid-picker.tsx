"use client";

import { useEffect, useState } from "react";
import type { Diagnosis } from "@/lib/record";

export function CidPicker({ value, onChange }: { value: Diagnosis[]; onChange: (v: Diagnosis[]) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Diagnosis[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cid?q=${encodeURIComponent(q)}`, { signal: controller.signal });
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

  const add = (d: Diagnosis) => {
    if (!value.some((v) => v.code === d.code)) onChange([...value, d]);
    setQuery("");
    setResults([]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((d) => (
          <span key={d.code} className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-900">
            <strong>{d.code}</strong> {d.description}
            <button type="button" aria-label={`Remover ${d.code}`} onClick={() => onChange(value.filter((v) => v.code !== d.code))} className="text-teal-700 hover:text-red-600">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar CID-10 por código ou nome (ex.: J45 ou asma)"
        />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {results.map((r) => (
              <li key={r.code}>
                <button type="button" onClick={() => add(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-teal-50">
                  <strong>{r.code}</strong> {r.description}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
