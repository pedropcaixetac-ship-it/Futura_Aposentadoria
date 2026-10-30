"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import type { AppointmentType } from "@prisma/client";
import { appointmentTypeLabel } from "@/lib/agenda";
import { searchPatients, type AppointmentFormState, type PatientOption } from "./actions";

type Props = {
  action: (state: AppointmentFormState, formData: FormData) => Promise<AppointmentFormState>;
  professionals: { id: string; name: string }[];
  defaults: {
    professionalId: string;
    date: string;
    time: string;
    duration: number;
    type: AppointmentType;
    insurance: string | null;
    notes: string | null;
  };
  // Na remarcação o paciente não muda.
  patient: PatientOption | null;
  lockPatient?: boolean;
  submitLabel: string;
};

export function AppointmentForm({ action, professionals, defaults, patient: initialPatient, lockPatient, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const [patient, setPatient] = useState(initialPatient);
  const [newPatient, setNewPatient] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientOption[]>([]);
  const [payment, setPayment] = useState(defaults.insurance ? "CONVENIO" : "PARTICULAR");
  const [insurance, setInsurance] = useState(defaults.insurance ?? "");

  // Busca enquanto digita, com uma pequena pausa para não buscar a cada letra.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => searchPatients(query).then(setResults), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const choose = (p: PatientOption) => {
    setPatient(p);
    setQuery("");
    setResults([]);
    if (p.insurance && p.insurance !== "Particular") {
      setPayment("CONVENIO");
      setInsurance(p.insurance);
    }
  };

  // Enviar sem limpar o formulário, para não perder o que foi digitado quando vier um aviso.
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => formAction(formData));
  };

  return (
    <form onSubmit={submit} className="card space-y-5">
      <section className="space-y-2">
        <h2 className="font-semibold">Paciente</h2>
        {patient ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-marinho-100 bg-marinho-50 px-3 py-2">
            <div>
              <p className="font-medium text-marinho-900">{patient.name}</p>
              <p className="text-xs text-slate-500">{[patient.phone, patient.insurance].filter(Boolean).join(" · ")}</p>
            </div>
            <input type="hidden" name="patientId" value={patient.id} />
            {!lockPatient && (
              <button type="button" onClick={() => setPatient(null)} className="text-sm text-marinho-700 hover:underline">Trocar</button>
            )}
          </div>
        ) : newPatient ? (
          <div className="space-y-3 rounded-md border border-dashed border-dourado-400 p-3">
            <p className="text-xs text-slate-500">Cadastro rápido. O restante do cadastro pode ser completado depois, na tela do paciente.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="newPatientName">Nome completo *</label>
                <input className="input" id="newPatientName" name="newPatientName" required autoFocus />
              </div>
              <div>
                <label className="label" htmlFor="newPatientPhone">Telefone</label>
                <input className="input" id="newPatientPhone" name="newPatientPhone" inputMode="tel" />
              </div>
            </div>
            <button type="button" onClick={() => setNewPatient(false)} className="text-sm text-marinho-700 hover:underline">
              Voltar para a busca
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, CPF ou telefone"
              aria-label="Buscar paciente"
              autoFocus
            />
            {query.trim().length >= 2 && (
              <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                {results.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => choose(p)} className="block w-full px-3 py-2 text-left text-sm hover:bg-marinho-50">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-slate-500">{p.phone && ` · ${p.phone}`}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => setNewPatient(true)}
                    className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-dourado-700 hover:bg-dourado-100"
                  >
                    + Paciente novo (cadastro rápido)
                  </button>
                </li>
              </ul>
            )}
            <button type="button" onClick={() => setNewPatient(true)} className="mt-2 text-sm text-marinho-700 hover:underline">
              Paciente novo? Fazer cadastro rápido
            </button>
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="professionalId">Profissional</label>
          <select className="input" id="professionalId" name="professionalId" defaultValue={defaults.professionalId} required>
            <option value="" disabled>Escolha</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="date">Data</label>
          <input className="input" id="date" name="date" type="date" defaultValue={defaults.date} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="time">Horário</label>
            <input className="input" id="time" name="time" type="time" step={300} defaultValue={defaults.time} required />
          </div>
          <div>
            <label className="label" htmlFor="duration">Duração (min)</label>
            <input className="input" id="duration" name="duration" type="number" min={5} max={480} step={5} defaultValue={defaults.duration} required />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="type">Tipo</label>
          <select className="input" id="type" name="type" defaultValue={defaults.type}>
            {(Object.keys(appointmentTypeLabel) as AppointmentType[]).map((t) => (
              <option key={t} value={t}>{appointmentTypeLabel[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Pagamento</span>
          <div className="flex gap-2">
            <select className="input w-auto!" name="payment" value={payment} onChange={(e) => setPayment(e.target.value)} aria-label="Pagamento">
              <option value="PARTICULAR">Particular</option>
              <option value="CONVENIO">Convênio</option>
            </select>
            {payment === "CONVENIO" && (
              <input
                className="input"
                name="insurance"
                value={insurance}
                onChange={(e) => setInsurance(e.target.value)}
                placeholder="Nome do convênio"
                aria-label="Nome do convênio"
                required
              />
            )}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">Observação</label>
          <textarea className="input min-h-20" id="notes" name="notes" defaultValue={defaults.notes ?? ""} placeholder="Ex.: trazer exames, primeira vez na clínica" />
        </div>
      </section>

      {state.warning && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Atenção: {state.warning}</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="confirmFit" value="1" className="h-4 w-4 accent-marinho-700" />
            Marcar mesmo assim (encaixe)
          </label>
        </div>
      )}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Salvando..." : submitLabel}</button>
    </form>
  );
}
