"use client";

import { startTransition, useActionState } from "react";
import type { FormState } from "./actions";

// Botões de checagem de um horário: feito ou não feito (com motivo).
export function CheckForm({ action, label, tone }: { action: (state: FormState, formData: FormData) => Promise<FormState>; label: string; tone: string }) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) formData.set(submitter.name, submitter.value);
    startTransition(() => formAction(formData));
  };
  return (
    <form onSubmit={submit} className={`flex flex-wrap items-center gap-1 rounded-md border px-2 py-1 text-xs ${tone}`}>
      <span className="font-semibold">{label}</span>
      <input name="note" className="w-36 rounded border border-slate-300 bg-white px-1 py-0.5" placeholder="Obs. / motivo" aria-label={`Observação ${label}`} />
      <button name="status" value="FEITO" disabled={pending} className="rounded bg-emerald-600 px-2 py-0.5 font-medium text-white">Feito</button>
      <button name="status" value="NAO_FEITO" disabled={pending} className="rounded bg-slate-500 px-2 py-0.5 font-medium text-white">Não feito</button>
      {state.error && <span className="w-full text-red-700">{state.error}</span>}
    </form>
  );
}
