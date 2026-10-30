"use client";

import { useEffect, useRef, useState } from "react";
import { createSnippet, type Snippet } from "@/app/(app)/textos-prontos/actions";

type Props = {
  fieldKey: string;
  snippets: Snippet[];
  currentText: () => string;
  onPick: (text: string) => void;
  onCreated: (snippet: Snippet) => void;
};

// Botão "Usar modelo" ao lado de cada campo do atendimento.
export function SnippetMenu({ fieldKey, snippets, currentText, onPick, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const available = snippets.filter((s) => !s.fieldKey || s.fieldKey === fieldKey);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const saveCurrent = async () => {
    const text = currentText().trim();
    if (!text) {
      setError("Escreva algo no campo antes de salvar como modelo.");
      return;
    }
    const title = prompt("Nome para este texto pronto:");
    if (!title?.trim()) return;
    onCreated(await createSnippet({ fieldKey, title, text }));
    setError("");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded border border-dourado-400 px-2 py-0.5 text-xs font-medium text-dourado-700 hover:bg-dourado-100"
      >
        Usar modelo ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 rounded-md border border-slate-200 bg-white shadow-lg">
          {available.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">Nenhum texto pronto para este campo.</p>}
          <ul className="max-h-64 overflow-auto">
            {available.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(s.text);
                    setOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-marinho-50"
                >
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="line-clamp-2 block text-xs text-slate-500">{s.text}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 p-2">
            <button type="button" onClick={saveCurrent} className="w-full rounded px-2 py-1 text-left text-sm text-marinho-700 hover:bg-marinho-50">
              + Salvar o texto deste campo como modelo
            </button>
            {error && <p className="px-2 text-xs text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
