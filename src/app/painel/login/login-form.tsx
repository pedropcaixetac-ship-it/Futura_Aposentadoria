"use client";

import { useActionState, useState } from "react";
import { platformLogin, platformLoginCode } from "./actions";

export function PlatformLoginForm() {
  const [state, action, pending] = useActionState(platformLogin, { error: "" });
  // Controlado para o e-mail continuar na tela quando a senha estiver errada.
  const [email, setEmail] = useState("");
  if (state.step === "codigo") return <CodeForm />;
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

// Segunda etapa, para quem ligou a verificação em duas etapas.
function CodeForm() {
  const [state, action, pending] = useActionState(platformLoginCode, { error: "" });
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="code">Código do aplicativo</label>
        <input
          className="input text-center text-lg tracking-widest" id="code" name="code" required autoFocus
          autoComplete="one-time-code" inputMode="text" maxLength={12} placeholder="000000"
        />
        <p className="mt-1 text-xs text-slate-500">
          Abra o Google Authenticator (ou o app que você usa) e digite os 6 números. Perdeu o celular? Use um dos códigos de recuperação.
        </p>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Conferindo..." : "Confirmar"}</button>
      <a href="/painel/login" className="block text-center text-sm text-marinho-700 hover:underline">Voltar</a>
    </form>
  );
}
