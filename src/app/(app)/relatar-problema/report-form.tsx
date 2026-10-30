"use client";

import Link from "next/link";
import { useActionState } from "react";
import { reportProblem } from "./actions";

export function ReportForm({ page, digest }: { page: string; digest: string }) {
  const [state, action, pending] = useActionState(reportProblem, { error: "" });
  if (state.ok) {
    return (
      <div className="card space-y-3">
        <p className="text-sm text-emerald-700">{state.ok}</p>
        <Link href={page || "/"} className="btn-secondary">Voltar para onde eu estava</Link>
      </div>
    );
  }
  return (
    <form action={action} className="card space-y-4">
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="digest" value={digest} />
      <div>
        <label className="label" htmlFor="message">O que aconteceu?</label>
        <textarea id="message" name="message" rows={6} required minLength={5} maxLength={1000} className="input"
          placeholder="Ex.: cliquei em Finalizar atendimento e a tela ficou carregando sem parar."
        />
        <p className="mt-1 text-xs text-slate-500">
          Conte o que você estava fazendo e o que esperava que acontecesse. Não escreva dados de pacientes (nome, CPF, diagnóstico).
        </p>
      </div>
      {page && <p className="text-xs text-slate-500">Tela: <span className="font-mono">{page}</span></p>}
      {digest && <p className="text-xs text-slate-500">Código do erro: <span className="font-mono">{digest}</span></p>}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Enviando..." : "Enviar relato"}</button>
    </form>
  );
}
