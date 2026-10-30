"use client";

import { useState, useTransition } from "react";
import { patientCancel, patientConfirm } from "./actions";

// Botões de cada próxima consulta. Desmarcar pede uma segunda confirmação para evitar toque sem querer.
export function AppointmentActions({ id, canConfirm, canCancel }: { id: string; canConfirm: boolean; canCancel: boolean }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (!canConfirm && !canCancel) return null;

  if (asking) {
    return (
      <form action={(fd) => start(() => patientCancel(id, fd))} className="mt-3 space-y-2 rounded-md bg-red-50 p-3">
        <p className="text-sm font-medium text-red-900">Desmarcar esta consulta?</p>
        <input className="input" name="reason" maxLength={300} placeholder="Motivo (opcional)" />
        <div className="flex gap-2">
          <button className="btn-primary flex-1 bg-red-600! hover:bg-red-700!" disabled={pending}>
            {pending ? "Desmarcando..." : "Sim, desmarcar"}
          </button>
          <button type="button" className="btn-secondary flex-1" onClick={() => setAsking(false)} disabled={pending}>
            Voltar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3 flex gap-2">
      {canConfirm && (
        <button
          type="button"
          className="btn-primary flex-1 bg-emerald-600! hover:bg-emerald-700!"
          disabled={pending}
          onClick={() => start(() => patientConfirm(id))}
        >
          {pending ? "Confirmando..." : "Confirmar presença"}
        </button>
      )}
      {canCancel && (
        <button type="button" className="btn-secondary flex-1" disabled={pending} onClick={() => setAsking(true)}>
          Desmarcar
        </button>
      )}
    </div>
  );
}
