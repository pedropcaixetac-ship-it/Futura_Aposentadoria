"use client";

import { useState } from "react";
import type { User } from "@prisma/client";
import { masks, formatCpf, roleLabel } from "@/lib/format";
import { councilTypes } from "@/lib/staff";
import { ActionForm } from "../financeiro/action-form";
import type { FormState } from "./actions";

type Staff = Pick<User, "name" | "email" | "cpf" | "role" | "jobTitle" | "sector" | "specialty" | "councilType" | "councilNumber" | "councilUf">;

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  staff?: Staff;
  isSelf?: boolean;
};

export function StaffForm({ action, staff, isSelf }: Props) {
  const [cpf, setCpf] = useState(formatCpf(staff?.cpf));
  const [role, setRole] = useState<string>(staff?.role ?? "PROFISSIONAL");

  return (
    <ActionForm action={action} submitLabel={staff ? "Salvar alterações" : "Cadastrar servidor"} resetOnSuccess={false}>
      <section className="space-y-3">
        <h2 className="font-semibold text-marinho-800">Identificação</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="name">Nome completo *</label>
            <input className="input" id="name" name="name" defaultValue={staff?.name} required />
          </div>
          <div>
            <label className="label" htmlFor="cpf">CPF</label>
            <input className="input" id="cpf" name="cpf" value={cpf} onChange={(e) => setCpf(masks.cpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" />
            <p className="mt-1 text-xs text-slate-500">Com o CPF, a pessoa também pode entrar no sistema por ele.</p>
          </div>
          <div>
            <label className="label" htmlFor="email">E-mail *</label>
            <input className="input" id="email" name="email" type="email" defaultValue={staff?.email} required />
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-slate-100 pt-4">
        <h2 className="font-semibold text-marinho-800">Função na clínica</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="jobTitle">Função / cargo</label>
            <input className="input" id="jobTitle" name="jobTitle" defaultValue={staff?.jobTitle ?? ""} placeholder="Ex.: Médica, Recepcionista, Auxiliar administrativo" />
          </div>
          <div>
            <label className="label" htmlFor="role">Perfil de acesso *</label>
            <select className="input" id="role" name="role" value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
              {Object.entries(roleLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {/* Campo desabilitado não vai no formulário; o próprio administrador continua administrador. */}
            {isSelf && <input type="hidden" name="role" value={role} />}
            <p className="mt-1 text-xs text-slate-500">Define as abas padrão. Dá para ajustar depois em &quot;Editar permissões&quot;.</p>
          </div>
          <div>
            <label className="label" htmlFor="sector">Setor</label>
            <input className="input" id="sector" name="sector" defaultValue={staff?.sector ?? ""} placeholder="Ex.: Consultório 1, Recepção" />
          </div>
          <div>
            <label className="label" htmlFor="specialty">Especialidade</label>
            <input className="input" id="specialty" name="specialty" defaultValue={staff?.specialty ?? ""} placeholder="Ex.: Cardiologia, Psicologia" />
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-slate-100 pt-4">
        <div>
          <h2 className="font-semibold text-marinho-800">Registro no conselho</h2>
          <p className="text-xs text-slate-500">
            Para profissionais de saúde. Sem ele a pessoa não vê o conteúdo clínico do prontuário. Também serve para entrar no sistema.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">
          <div>
            <label className="label" htmlFor="councilType">Conselho</label>
            <select className="input" id="councilType" name="councilType" defaultValue={staff?.councilType ?? ""}>
              <option value="">—</option>
              {councilTypes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="councilNumber">Número</label>
            <input className="input" id="councilNumber" name="councilNumber" defaultValue={staff?.councilNumber ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="councilUf">UF</label>
            <input className="input uppercase" id="councilUf" name="councilUf" maxLength={2} defaultValue={staff?.councilUf ?? ""} placeholder="SP" />
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-slate-100 pt-4">
        <h2 className="font-semibold text-marinho-800">{staff ? "Trocar senha" : "Senha inicial *"}</h2>
        <div className="max-w-sm">
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required={!staff} />
          <p className="mt-1 text-xs text-slate-500">
            {staff ? "Deixe em branco para manter a senha atual." : "Pelo menos 8 caracteres. Passe para a pessoa entrar pela primeira vez."}
          </p>
        </div>
      </section>
    </ActionForm>
  );
}
