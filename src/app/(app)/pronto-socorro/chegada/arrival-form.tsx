"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { formatDate, formatPhone } from "@/lib/format";
import { ARRIVAL_MODES } from "@/lib/pronto-socorro";
import { registerArrival, searchPatients, type FormState, type PatientOption } from "../actions";

// Ficha de chegada no pronto-socorro: quem é o paciente e por que veio. Depois vai para a triagem.
export function ArrivalForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const [newPatient, setNewPatient] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientOption[]>([]);
  const [state, formAction, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await registerArrival(prev, formData);
    if (!result.error) {
      formRef.current?.reset();
      setPatient(null);
      setNewPatient(false);
    }
    return result;
  }, { error: "" });

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => searchPatients(query).then(setResults), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => formAction(formData));
  };

  return (
    <form ref={formRef} onSubmit={submit} className="card space-y-5">
      <section className="space-y-2">
        <h2 className="font-semibold">Paciente</h2>
        {patient ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-marinho-100 bg-marinho-50 px-3 py-2">
            <div>
              <p className="font-medium text-marinho-900">{patient.name}</p>
              <p className="text-xs text-slate-500">
                {[patient.birthDate && `nascimento ${formatDate(patient.birthDate)}`, formatPhone(patient.phone)].filter(Boolean).join(" · ")}
              </p>
            </div>
            <input type="hidden" name="patientId" value={patient.id} />
            <button type="button" onClick={() => setPatient(null)} className="text-sm text-marinho-700 hover:underline">Trocar</button>
          </div>
        ) : newPatient ? (
          <div className="space-y-3 rounded-md border border-dashed border-dourado-400 p-3">
            <p className="text-xs text-slate-500">
              Cadastro rápido. Paciente sem identificação: escreva &quot;Desconhecido&quot; e um sinal (ex.: &quot;Desconhecido, homem ~40 anos, camisa azul&quot;).
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="newPatientName">Nome *</label>
                <input className="input" id="newPatientName" name="newPatientName" required autoFocus />
              </div>
              <div>
                <label className="label" htmlFor="newPatientPhone">Telefone</label>
                <input className="input" id="newPatientPhone" name="newPatientPhone" inputMode="tel" />
              </div>
            </div>
            <button type="button" onClick={() => setNewPatient(false)} className="text-sm text-marinho-700 hover:underline">Voltar para a busca</button>
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
                    <button
                      type="button"
                      onClick={() => {
                        setPatient(p);
                        setQuery("");
                        setResults([]);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-marinho-50"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-slate-500">{p.birthDate && ` · ${formatDate(p.birthDate)}`}{p.phone && ` · ${formatPhone(p.phone)}`}</span>
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
              Paciente novo ou sem identificação? Fazer cadastro rápido
            </button>
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="complaint">Motivo da procura (o que o paciente relata) *</label>
          <input className="input" id="complaint" name="complaint" required placeholder="Ex.: dor no peito há 1 hora" />
        </div>
        <div>
          <label className="label" htmlFor="arrivalMode">Como chegou</label>
          <select className="input" id="arrivalMode" name="arrivalMode" defaultValue={ARRIVAL_MODES[0]}>
            {ARRIVAL_MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="companion">Acompanhante</label>
          <input className="input" id="companion" name="companion" placeholder="Nome e parentesco" />
        </div>
      </section>

      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Salvando..." : "Registrar chegada"}</button>
    </form>
  );
}
