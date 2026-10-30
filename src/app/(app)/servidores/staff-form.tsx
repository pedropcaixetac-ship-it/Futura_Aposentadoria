"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import type { Role, User } from "@prisma/client";
import { formatCep, formatCpf, formatPhone, masks, onlyDigits, roleLabel } from "@/lib/format";
import { MARITAL_STATUS, UFS } from "@/lib/patient";
import { JOB_TITLES, ROLE_HELP, SECTORS, SPECIALTIES, councilTypes, displayName, jobTitleInfo, stripHonorific } from "@/lib/staff";
import type { FormState } from "./actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  staff?: Omit<User, "passwordHash">;
  isSelf?: boolean;
};

const OTHER = "__outro";
const dateValue = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : "");

function Section({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset className="card space-y-4">
      <legend className="float-left mb-2 w-full border-b border-dourado-300 pb-2 font-semibold text-marinho-800">{title}</legend>
      {hint && <p className="clear-both text-sm text-slate-500">{hint}</p>}
      <div className="clear-both grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function Field({ label, name, required, className, hint, ...props }: { label: string; name: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{label}{required && <span className="text-red-600"> *</span>}</label>
      <input className="input" id={name} name={name} required={required} {...props} />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
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

// Lista pronta com a opção "Outro", que abre um campo para digitar.
function ListOrOther({ label, name, value, onChange, options, groups, className, otherLabel = "Outro (digitar)" }: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options?: readonly string[];
  groups?: { group: string; options: string[] }[];
  className?: string;
  otherLabel?: string;
}) {
  const all = options ?? groups?.flatMap((g) => g.options) ?? [];
  const [custom, setCustom] = useState(!!value && !all.includes(value));
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{label}</label>
      <select
        className="input"
        id={name}
        value={custom ? OTHER : value}
        onChange={(e) => {
          const v = e.target.value;
          setCustom(v === OTHER);
          onChange(v === OTHER ? "" : v);
        }}
      >
        <option value="">Não informado</option>
        {options?.map((o) => <option key={o} value={o}>{o}</option>)}
        {groups?.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </optgroup>
        ))}
        <option value={OTHER}>{otherLabel}</option>
      </select>
      {custom ? (
        <input className="input mt-2" name={name} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Digite aqui" aria-label={`${label} (outro)`} />
      ) : (
        <input type="hidden" name={name} value={value} />
      )}
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

const jobGroups = [...new Set(JOB_TITLES.map((j) => j.group))].map((group) => ({
  group,
  options: JOB_TITLES.filter((j) => j.group === group).map((j) => j.title),
}));

export function StaffForm({ action, staff, isSelf }: Props) {
  const s = staff;
  const [state, formAction] = useActionState(action, { error: "" });
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [photo, setPhoto] = useState(s?.photo ?? "");
  const [cepStatus, setCepStatus] = useState("");
  const [name, setName] = useState(s?.name ?? "");
  const [sex, setSex] = useState(s?.sex ?? "");
  const [jobTitle, setJobTitle] = useState(s?.jobTitle ?? "");
  const [specialty, setSpecialty] = useState(s?.specialty ?? "");
  const [sector, setSector] = useState(s?.sector ?? "");
  const [role, setRole] = useState<Role>(s?.role ?? "PROFISSIONAL");
  const [access, setAccess] = useState(s?.systemAccess ?? true);
  const [councilType, setCouncilType] = useState(s?.councilType ?? "");
  // Quem passa a ter acesso agora precisa de uma senha.
  const needsPassword = !s?.systemAccess;

  const info = jobTitleInfo(jobTitle);
  const specialtyList = info?.specialties ? SPECIALTIES[info.specialties] : undefined;
  const plainName = stripHonorific(name);
  const shownAs = plainName ? displayName({ name: plainName, jobTitle: jobTitle || null, sex: sex || null }) : "";

  // Ao escolher a função, já sugere o perfil de acesso e o conselho. Dá para mudar depois.
  function chooseJobTitle(value: string) {
    setJobTitle(value);
    const next = jobTitleInfo(value);
    if (!next) return;
    if (next.specialties !== info?.specialties) setSpecialty("");
    if (next.council) setCouncilType(next.council);
    if (isSelf) return;
    if (next.role) {
      setRole(next.role);
      setAccess(true);
    } else {
      setAccess(false);
    }
  }

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
      const set = (field: string, v: string) => {
        const el = form.elements.namedItem(field) as HTMLInputElement | HTMLSelectElement | null;
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

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-5">
      <p className="text-sm text-slate-500">Campos com <span className="text-red-600">*</span> são obrigatórios.</p>

      <Section title="Identificação">
        <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-3">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dourado-300 bg-marinho-50 text-xs text-slate-400">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto guardada como data URL */}
            {photo ? <img src={photo} alt="Foto do servidor" className="h-full w-full object-cover" /> : "Sem foto"}
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
        <div className="sm:col-span-2">
          <Field label="Nome completo" name="name" required value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setName(plainName)} hint='Só o nome, sem "Dr." ou "Dra.". O sistema coloca sozinho para médicos, psicólogos e dentistas.' />
          {shownAs && shownAs !== name.trim() && (
            <p className="mt-1 text-sm text-marinho-700">Vai aparecer no sistema como <strong>{shownAs}</strong>.</p>
          )}
        </div>
        <Field label="Nome social" name="socialName" defaultValue={s?.socialName ?? ""} />
        <Field label="Data de nascimento" name="birthDate" type="date" required defaultValue={dateValue(s?.birthDate)} />
        <div>
          <label className="label" htmlFor="sex">Sexo</label>
          <select className="input" id="sex" name="sex" value={sex} onChange={(e) => setSex(e.target.value)}>
            <option value="">Não informado</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
            <option value="O">Outro</option>
          </select>
        </div>
        <Field label="CPF" name="cpf" required inputMode="numeric" defaultValue={formatCpf(s?.cpf)} {...mask(masks.cpf)} hint="Também serve para entrar no sistema." />
        <Field label="RG" name="rg" defaultValue={s?.rg ?? ""} />
        <Field label="Cartão SUS (CNS)" name="cns" inputMode="numeric" defaultValue={masks.cns(s?.cns ?? "")} {...mask(masks.cns)} />
        <Select label="Estado civil" name="maritalStatus" options={MARITAL_STATUS} defaultValue={s?.maritalStatus} />
        <Field label="Nome da mãe" name="motherName" defaultValue={s?.motherName ?? ""} className="sm:col-span-2" />
      </Section>

      <Section title="Contato">
        <Field label="Celular" name="phone" required inputMode="numeric" placeholder="(62) 99999-9999" defaultValue={formatPhone(s?.phone)} {...mask(masks.phone)} />
        <Field label="Telefone fixo" name="landline" inputMode="numeric" defaultValue={formatPhone(s?.landline)} {...mask(masks.phone)} />
        <Field label="E-mail" name="email" type="email" required={access} defaultValue={s?.email ?? ""} hint={access ? "Usado para entrar no sistema." : undefined} />
        <Field label="Contato de emergência (nome)" name="emergencyContactName" defaultValue={s?.emergencyContactName ?? ""} />
        <Field label="Telefone do contato de emergência" name="emergencyContactPhone" inputMode="numeric" defaultValue={formatPhone(s?.emergencyContactPhone)} {...mask(masks.phone)} />
      </Section>

      <Section title="Endereço">
        <div>
          <Field label="CEP" name="cep" inputMode="numeric" placeholder="00000-000" defaultValue={formatCep(s?.cep)} {...mask(masks.cep)} onBlur={(e) => lookupCep(e.target.value)} />
          {cepStatus ? <p className="mt-1 text-xs text-slate-500">{cepStatus}</p> : <p className="mt-1 text-xs text-slate-400">Digite o CEP e o endereço é preenchido sozinho.</p>}
        </div>
        <Field label="Rua" name="street" defaultValue={s?.street ?? ""} className="sm:col-span-1 lg:col-span-2" />
        <Field label="Número" name="number" defaultValue={s?.number ?? ""} />
        <Field label="Complemento" name="complement" defaultValue={s?.complement ?? ""} />
        <Field label="Bairro" name="district" defaultValue={s?.district ?? ""} />
        <Field label="Cidade" name="city" defaultValue={s?.city ?? ""} />
        <Select label="Estado (UF)" name="state" options={UFS} defaultValue={s?.state} />
      </Section>

      <Section title="Função na clínica" hint="Ao escolher a função, o sistema já sugere o perfil de acesso e o conselho.">
        <ListOrOther label="Função / cargo" name="jobTitle" value={jobTitle} onChange={chooseJobTitle} groups={jobGroups} otherLabel="Outra função (digitar)" />
        {specialtyList ? (
          <ListOrOther key={info?.specialties} label="Especialidade" name="specialty" value={specialty} onChange={setSpecialty} options={specialtyList} otherLabel="Outra especialidade (digitar)" />
        ) : (
          <Field label="Especialidade" name="specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Se houver" />
        )}
        <ListOrOther label="Setor" name="sector" value={sector} onChange={setSector} options={SECTORS} otherLabel="Outro setor (digitar)" />
      </Section>

      <Section title="Acesso ao sistema">
        <label className={`flex items-start gap-3 rounded-md border border-slate-200 p-3 sm:col-span-2 lg:col-span-3 ${isSelf ? "cursor-not-allowed" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            name="systemAccess"
            checked={access}
            onChange={(e) => setAccess(e.target.checked)}
            disabled={isSelf}
            className="mt-1 h-4 w-4 accent-marinho-700"
          />
          {isSelf && <input type="hidden" name="systemAccess" value="on" />}
          <span>
            <span className="block font-medium text-marinho-800">Tem acesso ao sistema</span>
            <span className="block text-sm text-slate-500">
              Desmarque para quem faz parte da equipe mas não usa o sistema (ex.: limpeza, manutenção). A pessoa fica no cadastro, sem login.
            </span>
          </span>
        </label>
        {access && (
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label" htmlFor="role">Perfil de acesso <span className="text-red-600">*</span></label>
            <select className="input max-w-md" id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
              {(Object.keys(roleLabel) as Role[]).map((value) => (
                <option key={value} value={value}>{roleLabel[value]}</option>
              ))}
            </select>
            {/* Campo desabilitado não vai no formulário; o próprio administrador continua administrador. */}
            {isSelf && <input type="hidden" name="role" value={role} />}
            <p className={`mt-2 rounded-md px-3 py-2 text-sm ${role === "TECNICO" ? "bg-dourado-100 text-dourado-700" : "bg-marinho-50 text-marinho-800"}`}>
              {ROLE_HELP[role]}
            </p>
            <p className="mt-1 text-xs text-slate-500">Define as abas padrão. Dá para ajustar depois em &quot;Editar permissões&quot;.</p>
          </div>
        )}
      </Section>

      <Section title="Registro no conselho" hint="Para profissionais de saúde. Sem ele a pessoa não vê o conteúdo clínico do prontuário. Também serve para entrar no sistema.">
        <div>
          <label className="label" htmlFor="councilType">Conselho</label>
          <select className="input" id="councilType" name="councilType" value={councilType} onChange={(e) => setCouncilType(e.target.value)}>
            <option value="">Não tem</option>
            {councilTypes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Field label="Número" name="councilNumber" defaultValue={s?.councilNumber ?? ""} />
        <Select label="UF do registro" name="councilUf" options={UFS} defaultValue={s?.councilUf} />
        {councilType === "CRM" && (
          <Field
            label="RQE (especialista)"
            name="rqe"
            inputMode="numeric"
            defaultValue={s?.rqe ?? ""}
            placeholder="Ex.: 12345"
            hint="Registro de Qualificação de Especialista. Sai junto com o CRM nos PDFs. Se tiver mais de um, separe por vírgula."
          />
        )}
      </Section>

      {access && (
        <Section title={needsPassword ? "Senha inicial" : "Trocar senha"}>
          <Field
            label="Senha"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required={needsPassword}
            hint={needsPassword ? "Pelo menos 8 caracteres. Passe para a pessoa entrar pela primeira vez." : "Deixe em branco para manter a senha atual."}
          />
        </Section>
      )}

      {state.error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Salvando..." : s ? "Salvar alterações" : "Cadastrar servidor"}</button>
    </form>
  );
}
