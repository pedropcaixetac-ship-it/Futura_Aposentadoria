"use client";

import { useActionState, useState } from "react";
import { formatMinutes, weekdayName } from "@/lib/agenda";
import type { HoursFormState } from "../actions";

type Period = { startMinute: number; endMinute: number };
type Action = (state: HoursFormState, formData: FormData) => Promise<HoursFormState>;

// Segunda a domingo, nessa ordem na tela.
const order = [1, 2, 3, 4, 5, 6, 0];

export function WorkHoursForm({ action, periods, slotMinutes }: { action: Action; periods: Record<number, Period[]>; slotMinutes: number }) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const [enabled, setEnabled] = useState(() => Object.fromEntries(order.map((d) => [d, (periods[d] ?? []).length > 0])));
  const value = (d: number, p: number, key: keyof Period) => {
    const period = periods[d]?.[p];
    return period ? formatMinutes(period[key]) : "";
  };

  return (
    <form action={formAction} className="card space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-semibold">Horários de atendimento</h2>
        <div>
          <label className="label" htmlFor="slotMinutes">Duração padrão da consulta (min)</label>
          <input className="input w-32!" id="slotMinutes" name="slotMinutes" type="number" min={5} max={240} step={5} defaultValue={slotMinutes} required />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Dia</th>
              <th className="py-2 pr-3 font-medium">Primeiro período</th>
              <th className="py-2 font-medium">Segundo período (opcional)</th>
            </tr>
          </thead>
          <tbody>
            {order.map((d) => (
              <tr key={d} className="border-t border-slate-100">
                <td className="py-2 pr-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={`d${d}_on`}
                      value="1"
                      checked={enabled[d]}
                      onChange={(e) => setEnabled({ ...enabled, [d]: e.target.checked })}
                      className="h-4 w-4 accent-marinho-700"
                    />
                    {weekdayName(d)}
                  </label>
                </td>
                {[0, 1].map((p) => (
                  <td key={p} className="py-2 pr-3">
                    <div className={`flex items-center gap-1 ${enabled[d] ? "" : "opacity-40"}`}>
                      <input className="input w-28!" type="time" name={`d${d}_p${p + 1}_start`} defaultValue={value(d, p, "startMinute")} disabled={!enabled[d]} aria-label={`${weekdayName(d)} início do período ${p + 1}`} />
                      <span className="text-slate-400">às</span>
                      <input className="input w-28!" type="time" name={`d${d}_p${p + 1}_end`} defaultValue={value(d, p, "endMinute")} disabled={!enabled[d]} aria-label={`${weekdayName(d)} fim do período ${p + 1}`} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.saved && !pending && <p className="text-sm text-emerald-700">Horários salvos.</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Salvando..." : "Salvar horários"}</button>
    </form>
  );
}

export function BlockForm({ action, today }: { action: Action; today: string }) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const [allDay, setAllDay] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <h3 className="text-sm font-semibold">Novo bloqueio</h3>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allDay" value="1" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 accent-marinho-700" />
        Dia inteiro (férias, folga, congresso)
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="label" htmlFor="startDate">De</label>
            <input className="input" id="startDate" name="startDate" type="date" defaultValue={today} required />
          </div>
          {!allDay && (
            <div>
              <label className="label" htmlFor="startTime">Hora</label>
              <input className="input w-28!" id="startTime" name="startTime" type="time" required />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="label" htmlFor="endDate">Até</label>
            <input className="input" id="endDate" name="endDate" type="date" defaultValue={today} required />
          </div>
          {!allDay && (
            <div>
              <label className="label" htmlFor="endTime">Hora</label>
              <input className="input w-28!" id="endTime" name="endTime" type="time" required />
            </div>
          )}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="reason">Motivo</label>
        <input className="input" id="reason" name="reason" placeholder="Ex.: almoço, férias, congresso" />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Salvando..." : "Bloquear"}</button>
    </form>
  );
}
