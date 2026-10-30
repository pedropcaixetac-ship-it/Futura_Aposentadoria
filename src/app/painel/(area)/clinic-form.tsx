"use client";

import { useState } from "react";
import { ActionForm } from "@/app/(app)/financeiro/action-form";
import { formatCnpj, suggestSlug } from "@/lib/painel";
import type { FormState } from "./actions";

type Clinic = {
  name: string;
  slug: string;
  cnpj: string | null;
  address: string | null;
  phone: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  clinic?: Clinic;
};

function Field({ label, name, hint, ...props }: { label: string; name: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} {...props} />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// Sem "clinic", cadastra uma clínica nova junto com o primeiro gerente do sistema.
export function ClinicForm({ action, clinic }: Props) {
  const [name, setName] = useState(clinic?.name ?? "");
  const [slug, setSlug] = useState(clinic?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!clinic);

  return (
    <ActionForm action={action} submitLabel={clinic ? "Salvar" : "Cadastrar clínica"} resetOnSuccess={false} className="space-y-6">
      <section className="card space-y-4">
        <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">Clínica</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nome da clínica" name="name" required value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(suggestSlug(e.target.value));
            }}
          />
          <Field
            label="Código da clínica" name="slug" required value={slug}
            onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugTouched(true); }}
            hint="É o que a equipe da clínica digita na tela de login. Sem acento nem espaço."
          />
          <Field label="CNPJ" name="cnpj" defaultValue={formatCnpj(clinic?.cnpj)} inputMode="numeric" hint="Ou o CPF, se for de pessoa física. Aparece no recibo." />
          <Field label="Telefone da clínica" name="phone" defaultValue={clinic?.phone ?? ""} />
          <div className="sm:col-span-2">
            <Field label="Endereço" name="address" defaultValue={clinic?.address ?? ""} />
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">Responsável pelo contrato</h2>
        <p className="text-sm text-slate-500">Com quem a empresa fala sobre suporte e cobrança.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nome" name="contactName" required defaultValue={clinic?.contactName ?? ""} />
          <Field label="E-mail" name="contactEmail" type="email" defaultValue={clinic?.contactEmail ?? ""} />
          <Field label="Telefone / WhatsApp" name="contactPhone" defaultValue={clinic?.contactPhone ?? ""} />
        </div>
      </section>

      {!clinic && (
        <section className="card space-y-4">
          <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">Primeiro acesso da clínica</h2>
          <p className="text-sm text-slate-500">
            Este será o gerente do sistema da clínica. Ele entra com o código da clínica, este e-mail e a senha
            inicial, troca a senha em &quot;Meu cadastro&quot; e cadastra o resto da equipe em &quot;Servidores&quot;.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" name="managerName" required />
            <Field label="E-mail (login)" name="managerEmail" type="email" required autoComplete="off" />
            <Field label="CPF" name="managerCpf" inputMode="numeric" hint="Opcional. Também serve para entrar." />
            <Field label="Senha inicial" name="managerPassword" type="password" required minLength={8} autoComplete="new-password" />
          </div>
        </section>
      )}
    </ActionForm>
  );
}
