"use client";

import { useActionState, useState } from "react";
import { platformLogin } from "./actions";

export function PlatformLoginForm() {
  const [state, action, pending] = useActionState(platformLogin, { error: "" });
  // Controlado para o e-mail continuar na tela quando a senha estiver errada.
  const [email, setEmail] = useState("");
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="username" autoCapitalize="none"
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
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
