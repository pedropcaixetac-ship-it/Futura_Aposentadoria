"use client";

import { useActionState } from "react";
import { confirmPlatformTwoFactor } from "./actions";

// Confirma o primeiro código do app e mostra, uma única vez, os códigos de recuperação.
export function PlatformTwoFactorConfirm() {
  const [state, action, pending] = useActionState(confirmPlatformTwoFactor, { error: "" });
  if (state.codes) {
    return (
      <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm">
        <p className="font-medium text-emerald-800">Pronto! A verificação em duas etapas está ligada.</p>
        <p className="text-slate-700">
          Guarde estes códigos de recuperação em lugar seguro (anote em papel ou tire um print). Se perder o celular, cada um
          deles entra no painel uma vez no lugar do código do app. Eles não aparecem de novo.
        </p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-base sm:grid-cols-4">
          {state.codes.map((c) => <li key={c} className="rounded bg-white px-2 py-1 text-center">{c}</li>)}
        </ul>
        <a href="/painel/minha-conta" className="btn-primary inline-block">Já guardei os códigos</a>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="code">Código que aparece no app</label>
        <input className="input w-40 text-center tracking-widest" id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000" />
      </div>
      <button className="btn-primary" disabled={pending}>{pending ? "Conferindo..." : "Confirmar e ativar"}</button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
