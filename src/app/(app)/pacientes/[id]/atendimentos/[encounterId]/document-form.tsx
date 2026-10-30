"use client";

import { useState } from "react";
import type { DocumentType } from "@prisma/client";
import { documentDefaultBody, documentTypeLabel, documentTypes } from "@/lib/documents";

export function DocumentForm({ issue }: { issue: (formData: FormData) => Promise<void> }) {
  const [type, setType] = useState<DocumentType>("RECEITA");
  const [body, setBody] = useState(documentDefaultBody.RECEITA);

  // Ao trocar o tipo, troca o texto inicial, a não ser que o profissional já tenha escrito algo.
  function changeType(next: DocumentType) {
    if (body.trim() === documentDefaultBody[type].trim()) setBody(documentDefaultBody[next]);
    setType(next);
  }

  return (
    <form
      action={async (formData) => {
        await issue(formData);
        setBody(documentDefaultBody[type]);
      }}
      className="space-y-2"
    >
      <div className="flex flex-wrap gap-2">
        {documentTypes.map((t) => (
          <label
            key={t}
            className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
              t === type ? "border-marinho-700 bg-marinho-700 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <input type="radio" name="type" value={t} checked={t === type} onChange={() => changeType(t)} className="sr-only" />
            {documentTypeLabel[t]}
          </label>
        ))}
      </div>
      <textarea className="input" name="body" rows={6} required value={body} onChange={(e) => setBody(e.target.value)} />
      <p className="text-xs text-slate-500">
        Depois de emitido, o documento não pode ser alterado. Para corrigir, emita um novo.
      </p>
      <button className="btn-primary">Emitir {documentTypeLabel[type].toLowerCase()}</button>
    </form>
  );
}
