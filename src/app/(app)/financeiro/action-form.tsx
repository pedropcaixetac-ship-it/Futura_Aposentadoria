"use client";

import { startTransition, useActionState, useRef } from "react";
import type { FormState } from "./actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
  children: React.ReactNode;
};

// Formulário que mostra o aviso de erro (ou de sucesso) devolvido pelo servidor.
// Se der erro, o que foi digitado continua na tela; só limpa quando dá certo.
export function ActionForm({ action, submitLabel, className, resetOnSuccess = true, children }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    if (!result.error && resetOnSuccess) formRef.current?.reset();
    return result;
  }, { error: "" });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className ?? "card space-y-4"}>
      {children}
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-primary" disabled={pending}>
        {pending ? "Salvando..." : submitLabel}
      </button>
    </form>
  );
}
