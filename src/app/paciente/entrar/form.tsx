"use client";

import { useActionState } from "react";
import { patientLogin } from "../actions";

export function PatientLoginForm() {
  const [state, action, pending] = useActionState(patientLogin, { error: "" });
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="clinic">Código da clínica</label>
        <input className="input" id="clinic" name="clinic" required autoCapitalize="none" spellCheck={false} />
        <p className="mt-1 text-xs text-slate-500">A recepção da clínica informa o código.</p>
      </div>
      <div>
        <label className="label" htmlFor="cpf">CPF</label>
        <input className="input" id="cpf" name="cpf" required inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" />
      </div>
      <div>
        <label className="label" htmlFor="birthDate">Data de nascimento</label>
        <input className="input" id="birthDate" name="birthDate" type="date" required />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
    </form>
  );
}
