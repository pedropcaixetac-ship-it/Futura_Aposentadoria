"use client";

import { useState, useTransition } from "react";
import type { TemplateField } from "@/lib/record";
import { copyTemplate } from "./actions";
import { TemplateForm, type Professional } from "./template-form";

type Template = { id: string; name: string; ownerId: string | null; fields: TemplateField[]; active: boolean };

type Props = {
  templates: Template[];
  canEdit?: boolean;
  canCopy?: boolean;
  professionals?: Professional[];
  empty?: string;
};

export function TemplateList({ templates, canEdit, canCopy, professionals, empty }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (templates.length === 0) return empty ? <p className="text-sm text-slate-400">{empty}</p> : null;

  return (
    <ul className="space-y-3">
      {templates.map((t) => (
        <li key={t.id} className="card">
          {editing === t.id ? (
            <TemplateForm template={t} professionals={professionals} onDone={() => setEditing(null)} />
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {t.name} {!t.active && <span className="text-xs text-slate-400">(inativo)</span>}
                </p>
                <p className="mt-1 text-sm text-slate-600">{t.fields.map((f) => f.label).join(" · ")}</p>
              </div>
              <div className="flex gap-3 text-sm">
                {canCopy && (
                  <button
                    disabled={pending}
                    onClick={() => startTransition(async () => {
                      await copyTemplate(t.id);
                      setCopied(t.id);
                    })}
                    className="text-marinho-700 hover:underline disabled:opacity-50"
                  >
                    {copied === t.id ? "Copiado para meus modelos" : "Copiar para meus modelos"}
                  </button>
                )}
                {canEdit && <button onClick={() => setEditing(t.id)} className="text-marinho-700 hover:underline">Editar</button>}
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
