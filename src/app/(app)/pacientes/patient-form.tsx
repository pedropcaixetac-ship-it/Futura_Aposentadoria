"use client";

import { useActionState } from "react";
import type { Patient } from "@prisma/client";
import type { FormState } from "./actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  patient?: Patient;
  submitLabel: string;
};

export function PatientForm({ action, patient, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const birth = patient?.birthDate ? patient.birthDate.toISOString().slice(0, 10) : "";

  const field = (name: keyof Patient, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} defaultValue={(patient?.[name] as string) ?? ""} {...props} />
    </div>
  );

  return (
    <form action={formAction} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Nome completo *", { required: true })}
        {field("socialName", "Nome social")}
        <div>
          <label className="label" htmlFor="birthDate">Data de nascimento</label>
          <input className="input" id="birthDate" name="birthDate" type="date" defaultValue={birth} />
        </div>
        <div>
          <label className="label" htmlFor="sex">Sexo</label>
          <select className="input" id="sex" name="sex" defaultValue={patient?.sex ?? ""}>
            <option value="">Não informado</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
            <option value="O">Outro</option>
          </select>
        </div>
        {field("cpf", "CPF", { inputMode: "numeric" })}
        {field("phone", "Telefone")}
        {field("email", "E-mail", { type: "email" })}
        {field("address", "Endereço")}
        {field("insurance", "Convênio")}
        {field("insuranceNumber", "Nº da carteirinha")}
        {field("guardianName", "Responsável legal (menores)")}
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="whatsappOptIn" className="mt-1" defaultChecked={patient?.whatsappOptIn ?? false} />
        <span>
          O paciente autoriza receber mensagens da clínica pelo WhatsApp (lembretes, confirmações e avisos de retorno).
          {patient?.whatsappOptInAt && (
            <span className="block text-xs text-slate-500">
              Autorizado em {patient.whatsappOptInAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
            </span>
          )}
        </span>
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Salvando..." : submitLabel}</button>
    </form>
  );
}
