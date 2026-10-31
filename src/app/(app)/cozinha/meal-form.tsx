"use client";

import { startTransition, useActionState } from "react";
import type { FormState } from "./actions";

// Botões da copa para a refeição de um leito. Recusou e não servido pedem o motivo.
export function MealForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) formData.set(submitter.name, submitter.value);
    startTransition(() => formAction(formData));
  };
  return (
    <form onSubmit={submit} className="no-print flex flex-wrap items-center gap-1 text-xs">
      <button name="status" value="ENTREGUE" disabled={pending} className="rounded bg-emerald-600 px-2 py-1 font-medium text-white">Entregue</button>
      <input name="note" className="w-32 rounded border border-slate-300 px-1 py-1" placeholder="Motivo" aria-label="Motivo" />
      <button name="status" value="RECUSOU" disabled={pending} className="rounded bg-amber-600 px-2 py-1 font-medium text-white">Recusou</button>
      <button name="status" value="NAO_SERVIDO" disabled={pending} className="rounded bg-slate-500 px-2 py-1 font-medium text-white">Não servido</button>
      {state.error && <span className="w-full text-red-700">{state.error}</span>}
    </form>
  );
}
