import { PASSWORD_MIN, PASSWORD_RULES } from "@/lib/password";

// Campos de troca da própria senha (Meu cadastro e primeiro acesso).
export function PasswordFields({ currentLabel = "Senha atual" }: { currentLabel?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <label className="label" htmlFor="current">{currentLabel}</label>
        <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Nova senha</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
        <p className="mt-1 text-xs text-slate-500">{PASSWORD_RULES} Não use o seu nome, CPF ou data de nascimento.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">Repita a nova senha</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
      </div>
    </div>
  );
}
