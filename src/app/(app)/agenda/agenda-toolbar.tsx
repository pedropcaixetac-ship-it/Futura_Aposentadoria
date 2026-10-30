"use client";

import { useRouter } from "next/navigation";

type Props = {
  date: string;
  view: "dia" | "semana";
  professionalId: string;
  professionals: { id: string; name: string }[];
  // Recepção e administrador escolhem o profissional; o profissional vê só a própria agenda.
  canChooseProfessional: boolean;
  prevDate: string;
  nextDate: string;
  todayDate: string;
};

export function AgendaToolbar({ date, view, professionalId, professionals, canChooseProfessional, prevDate, nextDate, todayDate }: Props) {
  const router = useRouter();
  const go = (changes: Partial<{ data: string; visao: string; profissional: string }>) => {
    const params = new URLSearchParams({ data: date, visao: view, profissional: professionalId, ...changes });
    if (!params.get("profissional")) params.delete("profissional");
    router.push(`/agenda?${params}`);
  };
  const tab = (v: "dia" | "semana", label: string) => (
    <button
      type="button"
      onClick={() => go({ visao: v })}
      className={`px-3 py-1.5 text-sm ${view === v ? "bg-marinho-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-md border border-slate-300">
        <button type="button" onClick={() => go({ data: prevDate })} className="bg-white px-3 py-1.5 text-sm hover:bg-slate-50" aria-label="Anterior">←</button>
        <button type="button" onClick={() => go({ data: todayDate })} className="border-x border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Hoje</button>
        <button type="button" onClick={() => go({ data: nextDate })} className="bg-white px-3 py-1.5 text-sm hover:bg-slate-50" aria-label="Próximo">→</button>
      </div>
      <input
        type="date"
        value={date}
        onChange={(e) => e.target.value && go({ data: e.target.value })}
        className="input w-auto! py-1.5"
        aria-label="Data"
      />
      <div className="flex overflow-hidden rounded-md border border-slate-300">
        {tab("dia", "Dia")}
        {tab("semana", "Semana")}
      </div>
      {canChooseProfessional && (
        <select
          value={professionalId}
          onChange={(e) => go({ profissional: e.target.value })}
          className="input w-auto! py-1.5"
          aria-label="Profissional"
        >
          {view === "dia" && <option value="">Todos os profissionais</option>}
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
