"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import type { Patient } from "@prisma/client";
import { age, formatCep, formatCpf, formatPhone, masks, onlyDigits } from "@/lib/format";
import { MARITAL_STATUS, REFERRAL_SOURCES, UFS, type RegistrationMode } from "@/lib/patient";
import type { FormState } from "./actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  patient?: Patient;
  mode?: RegistrationMode;
  submitLabel: string;
};

const dateValue = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : "");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card space-y-4">
      <legend className="float-left mb-2 w-full border-b border-dourado-300 pb-2 font-semibold text-marinho-800">{title}</legend>
      <div className="clear-both grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function Field({ label, name, required, className, ...props }: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{label}{required && <span className="text-red-600"> *</span>}</label>
      <input className="input" id={name} name={name} required={required} {...props} />
    </div>
  );
}

function Select({ label, name, options, defaultValue, className }: { label: string; name: string; options: readonly string[]; defaultValue?: string | null; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{label}</label>
      <select className="input" id={name} name={name} defaultValue={defaultValue ?? ""}>
        <option value="">Não informado</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

const mask = (fn: (v: string) => string) => ({
  onInput: (e: React.FormEvent<HTMLInputElement>) => {
    e.currentTarget.value = fn(e.currentTarget.value);
  },
});

// Reduz a foto no próprio navegador para ~256px, para ficar leve no banco.
function resizePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function PatientForm({ action, patient, mode = "completo", submitLabel }: Props) {
  const [state, formAction] = useActionState(action, { error: "" });
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [birthDate, setBirthDate] = useState(dateValue(patient?.birthDate));
  const [convenio, setConvenio] = useState(!!patient?.insurance && patient.insurance !== "Particular");
  const [photo, setPhoto] = useState(patient?.photo ?? "");
  const [cepStatus, setCepStatus] = useState("");

  const quick = mode === "rapido";
  const years = birthDate ? age(new Date(`${birthDate}T00:00:00Z`)) : null;
  const minor = years !== null && years < 18;

  // Envia sem limpar o formulário, para a pessoa não perder o que digitou se houver erro.
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => formAction(formData));
  }

  async function lookupCep(value: string) {
    const cep = onlyDigits(value);
    if (cep.length !== 8) return;
    setCepStatus("Buscando endereço...");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepStatus("CEP não encontrado. Preencha o endereço à mão.");
        return;
      }
      const form = formRef.current!;
      const set = (name: string, v: string) => {
        const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
        if (el && v) el.value = v;
      };
      set("street", data.logradouro);
      set("district", data.bairro);
      set("city", data.localidade);
      set("state", data.uf);
      setCepStatus("");
      (form.elements.namedItem("number") as HTMLInputElement)?.focus();
    } catch {
      setCepStatus("Não foi possível buscar o CEP agora. Preencha o endereço à mão.");
    }
  }

  async function choosePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPhoto(await resizePhoto(file));
  }

  const p = patient;
  const footer = (
    <div className="space-y-3">
      {state.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{state.error}</p>
          {state.duplicate && (
            <>
              <p className="mt-1">
                Veja o cadastro existente:{" "}
                <Link href={`/pacientes/${state.duplicate.id}`} className="font-medium underline" target="_blank">{state.duplicate.name}</Link>
              </p>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" name="confirmDuplicate" /> É outra pessoa. Salvar mesmo assim.
              </label>
            </>
          )}
        </div>
      )}
      <button className="btn-primary" disabled={pending}>{pending ? "Salvando..." : submitLabel}</button>
    </div>
  );

  if (quick) {
    return (
      <form ref={formRef} onSubmit={submit} className="card space-y-4">
        <input type="hidden" name="mode" value="rapido" />
        <input type="hidden" name="phoneWhatsapp" value="on" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nome completo" name="name" required className="sm:col-span-3" />
          <Field label="Data de nascimento" name="birthDate" type="date" required />
          <Field label="Celular (WhatsApp)" name="phone" required inputMode="numeric" placeholder="(62) 99999-9999" {...mask(masks.phone)} />
          <Field label="CPF (opcional)" name="cpf" inputMode="numeric" {...mask(masks.cpf)} />
        </div>
        <p className="text-sm text-slate-500">O paciente fica marcado como &quot;cadastro incompleto&quot; até alguém preencher a ficha completa.</p>
        {footer}
      </form>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-5">
      <input type="hidden" name="mode" value="completo" />
      <p className="text-sm text-slate-500">Campos com <span className="text-red-600">*</span> são obrigatórios.</p>

      <Section title="Identificação">
        <div className="row-span-2 flex items-center gap-4 sm:col-span-2 lg:col-span-3">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dourado-300 bg-marinho-50 text-xs text-slate-400">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto guardada como data URL */}
            {photo ? <img src={photo} alt="Foto do paciente" className="h-full w-full object-cover" /> : "Sem foto"}
          </div>
          <div className="space-y-2 text-sm">
            <input type="hidden" name="photo" value={photo} />
            <label className="btn-secondary cursor-pointer">
              {photo ? "Trocar foto" : "Adicionar foto"}
              <input type="file" accept="image/*" capture="user" className="hidden" onChange={choosePhoto} />
            </label>
            {photo && <button type="button" className="ml-2 text-red-600 hover:underline" onClick={() => setPhoto("")}>Remover</button>}
          </div>
        </div>
        <Field label="Nome completo" name="name" required defaultValue={p?.name} className="sm:col-span-2" />
        <Field label="Nome social" name="socialName" defaultValue={p?.socialName ?? ""} />
        <Field label="Data de nascimento" name="birthDate" type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        <div>
          <label className="label" htmlFor="sex">Sexo</label>
          <select className="input" id="sex" name="sex" defaultValue={p?.sex ?? ""}>
            <option value="">Não informado</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
            <option value="O">Outro</option>
          </select>
        </div>
        <Field label="CPF" name="cpf" required inputMode="numeric" defaultValue={formatCpf(p?.cpf)} {...mask(masks.cpf)} />
        <Field label="RG" name="rg" defaultValue={p?.rg ?? ""} />
        <Field label="Cartão SUS (CNS)" name="cns" inputMode="numeric" defaultValue={masks.cns(p?.cns ?? "")} {...mask(masks.cns)} />
        <Select label="Estado civil" name="maritalStatus" options={MARITAL_STATUS} defaultValue={p?.maritalStatus} />
        <Field label="Nome da mãe" name="motherName" defaultValue={p?.motherName ?? ""} className="sm:col-span-2" />
        <Field label="Profissão" name="occupation" defaultValue={p?.occupation ?? ""} />
      </Section>

      <Section title="Contato">
        <div>
          <Field label="Celular (WhatsApp)" name="phone" required inputMode="numeric" placeholder="(62) 99999-9999" defaultValue={formatPhone(p?.phone)} {...mask(masks.phone)} />
          <label className="mt-1 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="phoneWhatsapp" defaultChecked={p?.phoneWhatsapp ?? true} /> Este número tem WhatsApp
          </label>
        </div>
        <Field label="Telefone fixo" name="landline" inputMode="numeric" defaultValue={formatPhone(p?.landline)} {...mask(masks.phone)} />
        <Field label="E-mail" name="email" type="email" defaultValue={p?.email ?? ""} />
        <Field label="Contato de emergência (nome)" name="emergencyContactName" defaultValue={p?.emergencyContactName ?? ""} />
        <Field label="Telefone do contato de emergência" name="emergencyContactPhone" inputMode="numeric" defaultValue={formatPhone(p?.emergencyContactPhone)} {...mask(masks.phone)} />
      </Section>

      <Section title="Endereço">
        <div>
          <Field label="CEP" name="cep" inputMode="numeric" placeholder="00000-000" defaultValue={formatCep(p?.cep)} {...mask(masks.cep)} onBlur={(e) => lookupCep(e.target.value)} />
          {cepStatus ? <p className="mt-1 text-xs text-slate-500">{cepStatus}</p> : <p className="mt-1 text-xs text-slate-400">Digite o CEP e o endereço é preenchido sozinho.</p>}
        </div>
        <Field label="Rua" name="street" defaultValue={p?.street ?? ""} className="sm:col-span-1 lg:col-span-2" />
        <Field label="Número" name="number" defaultValue={p?.number ?? ""} />
        <Field label="Complemento" name="complement" defaultValue={p?.complement ?? ""} />
        <Field label="Bairro" name="district" defaultValue={p?.district ?? ""} />
        <Field label="Cidade" name="city" defaultValue={p?.city ?? ""} />
        <Select label="Estado (UF)" name="state" options={UFS} defaultValue={p?.state} />
      </Section>

      <Section title="Convênio">
        <div className="flex items-center gap-5 text-sm sm:col-span-2 lg:col-span-3">
          <label className="flex items-center gap-2">
            <input type="radio" name="insuranceType" value="particular" checked={!convenio} onChange={() => setConvenio(false)} /> Particular
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="insuranceType" value="convenio" checked={convenio} onChange={() => setConvenio(true)} /> Convênio
          </label>
        </div>
        {convenio && (
          <>
            <Field label="Nome do convênio / plano" name="insurance" required defaultValue={p?.insurance === "Particular" ? "" : (p?.insurance ?? "")} />
            <Field label="Nº da carteirinha" name="insuranceNumber" defaultValue={p?.insuranceNumber ?? ""} />
            <Field label="Validade da carteirinha" name="insuranceValidUntil" type="date" defaultValue={dateValue(p?.insuranceValidUntil)} />
          </>
        )}
      </Section>

      <Section title="Responsável legal">
        <p className="text-sm text-slate-500 sm:col-span-2 lg:col-span-3">
          {minor ? <span className="font-medium text-dourado-700">Paciente menor de idade: preencha o responsável.</span> : "Para menores de idade ou pacientes sob tutela."}
        </p>
        <Field label="Nome do responsável" name="guardianName" defaultValue={p?.guardianName ?? ""} />
        <Field label="Parentesco" name="guardianRelationship" placeholder="Mãe, pai, tutor..." defaultValue={p?.guardianRelationship ?? ""} />
        <Field label="CPF do responsável" name="guardianCpf" inputMode="numeric" defaultValue={formatCpf(p?.guardianCpf)} {...mask(masks.cpf)} />
        <Field label="Telefone do responsável" name="guardianPhone" inputMode="numeric" defaultValue={formatPhone(p?.guardianPhone)} {...mask(masks.phone)} />
      </Section>

      <Section title="Outras informações">
        <Select label="Como conheceu a clínica" name="referralSource" options={REFERRAL_SOURCES} defaultValue={p?.referralSource} />
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="label" htmlFor="notes">Observações</label>
          <textarea className="input" id="notes" name="notes" rows={3} defaultValue={p?.notes ?? ""} placeholder="Ex.: prefere atendimento à tarde, precisa de acessibilidade..." />
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-3">
          <input type="checkbox" name="lgpdConsent" defaultChecked={!!p?.lgpdConsentAt} className="mt-1" />
          <span>
            O paciente autorizou a clínica a guardar e usar seus dados para o atendimento (LGPD).
            {p?.lgpdConsentAt && <span className="text-slate-400"> Autorizado em {p.lgpdConsentAt.toLocaleDateString("pt-BR")}.</span>}
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-3">
          <input type="checkbox" name="whatsappOptIn" defaultChecked={p?.whatsappOptIn ?? false} className="mt-1" />
          <span>
            O paciente autoriza receber mensagens da clínica pelo WhatsApp (lembretes, confirmações e avisos de retorno).
            {p?.whatsappOptInAt && <span className="text-slate-400"> Autorizado em {p.whatsappOptInAt.toLocaleDateString("pt-BR")}.</span>}
          </span>
        </label>
      </Section>

      {footer}
    </form>
  );
}
