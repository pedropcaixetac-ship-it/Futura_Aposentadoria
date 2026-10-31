"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { formatPhone } from "@/lib/format";
import { ADMISSION_ORIGINS } from "@/lib/internacao";
import type { Diagnosis } from "@/lib/record";
import { CidPicker } from "../../pacientes/[id]/atendimentos/[encounterId]/cid-picker";
import { admitPatient, searchPatients, type PatientOption } from "../actions";

type Props = {
  freeBeds: { ward: string; beds: { id: string; code: string }[] }[];
  defaultBed: string;
  professionals: { id: string; name: string }[];
  defaultAttending: string;
  patient: PatientOption | null;
  // CID só para quem tem acesso ao conteúdo clínico.
  showCid: boolean;
};

// Data e hora de agora em Brasília, no formato do campo datetime-local.
function nowLocal() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 16);
}

export function AdmitForm({ freeBeds, defaultBed, professionals, defaultAttending, patient: initialPatient, showCid }: Props) {
  const [state, formAction, pending] = useActionState(admitPatient, { error: "" });
  const [patient, setPatient] = useState(initialPatient);
  const [newPatient, setNewPatient] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientOption[]>([]);
  const [insurance, setInsurance] = useState(initialPatient?.insurance ?? "");
  const [cid, setCid] = useState<Diagnosis[]>([]);
  const [admittedAt] = useState(nowLocal);

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
    if (p.insurance) setInsurance(p.insurance);
  };

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
              <p className="text-xs text-slate-500">{[formatPhone(patient.phone), patient.insurance].filter(Boolean).join(" · ")}</p>
            </div>
            <input type="hidden" name="patientId" value={patient.id} />
            <button type="button" onClick={() => setPatient(null)} className="text-sm text-marinho-700 hover:underline">Trocar</button>
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
                    <button type="button" onClick={() => choose(p)} className="block w-full px-3 py-2 text-left text-sm hover:bg-marinho-50">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-slate-500">{p.phone && ` · ${formatPhone(p.phone)}`}</span>
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
        <div>
          <label className="label" htmlFor="bedId">Leito</label>
          <select className="input" id="bedId" name="bedId" defaultValue={defaultBed} required>
            <option value="" disabled>Escolha um leito livre</option>
            {freeBeds.map((g) => (
              <optgroup key={g.ward} label={g.ward}>
                {g.beds.map((b) => <option key={b.id} value={b.id}>{g.ward} · {b.code}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="attendingId">Médico responsável</label>
          <select className="input" id="attendingId" name="attendingId" defaultValue={defaultAttending} required>
            <option value="" disabled>Escolha</option>
            {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="origin">Veio de</label>
          <select className="input" id="origin" name="origin" defaultValue="" required>
            <option value="" disabled>Escolha</option>
            {ADMISSION_ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="admittedAt">Data e hora da internação</label>
          <input className="input" id="admittedAt" name="admittedAt" type="datetime-local" defaultValue={admittedAt} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="insurance">SUS, convênio ou particular</label>
          <input className="input" id="insurance" name="insurance" value={insurance} onChange={(e) => setInsurance(e.target.value)} placeholder="Ex.: SUS, Unimed, Particular" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="reason">Motivo da internação</label>
          <textarea className="input min-h-20" id="reason" name="reason" placeholder="Ex.: pneumonia comunitária, para antibiótico venoso" />
        </div>
        {showCid && (
          <div className="sm:col-span-2">
            <span className="label">CID-10 principal</span>
            <CidPicker value={cid} onChange={(v) => setCid(v.slice(-1))} />
            {cid[0] && (
              <>
                <input type="hidden" name="cidCode" value={cid[0].code} />
                <input type="hidden" name="cidDescription" value={cid[0].description} />
              </>
            )}
          </div>
        )}
      </section>

      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Internando..." : "Internar"}</button>
    </form>
  );
}
