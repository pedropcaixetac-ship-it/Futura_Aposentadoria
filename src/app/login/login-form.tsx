"use client";

import { useActionState, useEffect, useState } from "react";
import { parseLoginId } from "@/lib/login";
import { UFS } from "@/lib/patient";
import { readInstitutions, type RememberedInstitution } from "@/lib/remembered-institutions";
import { login, loginCode } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: "" });
  // Campos controlados: o React limpa o formulário depois de enviar, e quem errou a senha
  // não precisa digitar a instituição e o login de novo.
  const [clinic, setClinic] = useState("demo");
  // Instituições já usadas neste aparelho; "outra" mostra o campo do código.
  const [known, setKnown] = useState<RememberedInstitution[]>([]);
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    const list = readInstitutions();
    if (!list.length) return;
    setKnown(list);
    setClinic(list[0].code);
    setTyping(false);
  }, []);
  const [loginId, setLoginId] = useState("");
  // Quem entra pelo número do conselho precisa dizer de qual estado é o registro.
  const isCouncil = parseLoginId(loginId)?.kind === "council";

  if (state.step === "codigo") return <CodeForm />;

  return (
    <form action={action} className="space-y-4">
      {known.length > 0 && (
        <div>
          <label className="label" htmlFor="institution">Instituição</label>
          <select
            className="input" id="institution" value={typing ? "" : clinic}
            onChange={(e) => {
              setTyping(!e.target.value);
              setClinic(e.target.value);
            }}
          >
            {known.map((i) => <option key={i.code} value={i.code}>{i.name}</option>)}
            <option value="">Outra instituição (digitar o código)</option>
          </select>
        </div>
      )}
      {typing ? (
        <div>
          <label className="label" htmlFor="clinic">Código da instituição</label>
          <input className="input" id="clinic" name="clinic" required value={clinic} onChange={(e) => setClinic(e.target.value)} />
        </div>
      ) : (
        <input type="hidden" name="clinic" value={clinic} />
      )}
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

// Segunda etapa, para quem ativou a verificação em duas etapas.
function CodeForm() {
  const [state, action, pending] = useActionState(loginCode, { error: "" });
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
      <a href="/login" className="block text-center text-sm text-marinho-700 hover:underline">Voltar</a>
    </form>
  );
}
