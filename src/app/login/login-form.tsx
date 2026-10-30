"use client";

import { useActionState, useState } from "react";
import { parseLoginId } from "@/lib/login";
import { UFS } from "@/lib/patient";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: "" });
  const [loginId, setLoginId] = useState("");
  // Quem entra pelo número do conselho precisa dizer de qual estado é o registro.
  const isCouncil = parseLoginId(loginId)?.kind === "council";
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="clinic">Código da clínica</label>
        <input className="input" id="clinic" name="clinic" defaultValue="demo" required />
      </div>
      <div>
        <label className="label" htmlFor="login">E-mail, CPF ou CRM</label>
        <input
          className="input" id="login" name="login" required autoComplete="username" autoCapitalize="none" spellCheck={false}
          value={loginId} onChange={(e) => setLoginId(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">Profissionais podem usar o número do conselho (CRM, CRP...).</p>
      </div>
      {isCouncil && (
        <div>
          <label className="label" htmlFor="uf">UF do conselho</label>
          <select className="input" id="uf" name="uf" required defaultValue="">
            <option value="" disabled>Escolha o estado</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="label" htmlFor="password">Senha</label>
        <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
    </form>
  );
}
