"use client";

import { useState } from "react";
import type { TemplateField } from "@/lib/record";
import { TemplateForm } from "./template-form";

type Template = { id: string; name: string; specialty: string | null; fields: TemplateField[]; active: boolean };

export function TemplateList({ templates }: { templates: Template[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <ul className="space-y-3">
      {templates.map((t) => (
        <li key={t.id} className="card">
          {editing === t.id ? (
            <TemplateForm template={t} onDone={() => setEditing(null)} />
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {t.name} {!t.active && <span className="text-xs text-slate-400">(inativo)</span>}
                </p>
                {t.specialty && <p className="text-sm text-slate-500">{t.specialty}</p>}
                <p className="mt-1 text-sm text-slate-600">{t.fields.map((f) => f.label).join(" · ")}</p>
              </div>
              <button onClick={() => setEditing(t.id)} className="text-sm text-marinho-700 hover:underline">Editar</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
