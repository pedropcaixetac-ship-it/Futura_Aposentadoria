"use client";

import { useActionState, useState } from "react";
import { MAX_MESSAGE_LENGTH, MESSAGE_FIELDS, fillMessage, type MessageField } from "@/lib/whatsapp";
import type { MessageFormState } from "./actions";

type Props = {
  action: (state: MessageFormState, formData: FormData) => Promise<MessageFormState>;
  label: string;
  where: string;
  fields: readonly MessageField[];
  text: string;
  isDefault: boolean;
  updatedInfo: string | null;
  example: Record<MessageField, string>;
};

export function MessageForm({ action, label, where, fields, text, isDefault, updatedInfo, example }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const [value, setValue] = useState(text);

  return (
    <form action={formAction} className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{label}</h2>
          <p className="text-sm text-slate-500">{where}</p>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs ${isDefault ? "bg-slate-100 text-slate-600" : "bg-dourado-100 text-dourado-700"}`}>
          {isDefault ? "Texto padrão do sistema" : "Texto da clínica"}
        </span>
      </div>

      <textarea
        className="input"
        name="text"
        rows={4}
        maxLength={MAX_MESSAGE_LENGTH}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Texto: ${label}`}
      />

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <span>Clique para colocar no texto:</span>
        {fields.map((f) => (
          <button
            key={f}
            type="button"
            title={MESSAGE_FIELDS[f]}
            onClick={() => setValue((v) => `${v}${v && !v.endsWith(" ") ? " " : ""}[${f}]`)}
            className="rounded border border-marinho-200 bg-marinho-50 px-1.5 py-0.5 font-mono text-marinho-800 hover:bg-marinho-100"
          >
            [{f}]
          </button>
        ))}
      </div>

      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
        <p className="mb-1 text-xs font-medium text-emerald-800">Como o paciente vai receber (exemplo):</p>
        <p className="whitespace-pre-wrap text-slate-800">{fillMessage(value, Object.fromEntries(fields.map((f) => [f, example[f]])))}</p>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.saved && !state.error && !pending && <p className="text-sm text-emerald-700">Mensagem salva.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Salvando..." : "Salvar mensagem"}</button>
        {!isDefault && (
          <button name="restore" value="1" className="text-sm text-slate-500 hover:underline" disabled={pending}>
            Voltar ao texto padrão
          </button>
        )}
        {updatedInfo && <span className="text-xs text-slate-400">{updatedInfo}</span>}
      </div>
    </form>
  );
}
