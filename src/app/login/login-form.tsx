"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: "" });
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="clinic">Código da clínica</label>
        <input className="input" id="clinic" name="clinic" defaultValue="demo" required />
      </div>
      <div>
        <label className="label" htmlFor="login">E-mail, CPF ou CRM</label>
        <input className="input" id="login" name="login" required autoComplete="username" autoCapitalize="none" spellCheck={false} />
        <p className="mt-1 text-xs text-slate-500">Profissionais podem usar o número do conselho (CRM, CRP...).</p>
      </div>
      <div>
        <label className="label" htmlFor="password">Senha</label>
        <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
    </form>
  );
}
