import { formatDate, formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { sessionDoses, sessionStatusLabel } from "@/lib/quimio";
import type { ChemoSessionStatus } from "@prisma/client";
import { ActionForm } from "../financeiro/action-form";
import { administerSession, cancelSession, postponeSession, releaseSession } from "./actions";

type Person = { name: string; sex: string | null; jobTitle: string | null } | null;
export type SessionRowData = {
  id: string;
  cycle: number;
  day: number;
  date: Date;
  status: ChemoSessionStatus;
  doses: unknown;
  note: string | null;
  releasedAt: Date | null;
  releasedBy: Person;
  administeredAt: Date | null;
  administeredBy: Person;
};

const statusTone: Record<ChemoSessionStatus, string> = {
  AGENDADA: "bg-marinho-100 text-marinho-800",
  REALIZADA: "bg-emerald-100 text-emerald-800",
  ADIADA: "bg-amber-100 text-amber-800",
  CANCELADA: "bg-slate-200 text-slate-600",
};

// Uma sessão: doses do dia e o que cada um pode fazer (médico libera, adia ou cancela; enfermagem aplica).
export function SessionRow({ s, doctor, nursing, today, title, open }: { s: SessionRowData; doctor: boolean; nursing: boolean; today: Date; title?: React.ReactNode; open: boolean }) {
  const due = s.date.getTime() <= today.getTime();
  // Liberação só perto do dia (exames recentes): até 3 dias antes.
  const releasable = s.date.getTime() <= today.getTime() + 3 * 24 * 3600_000;
  return (
    <li className="space-y-2 rounded-md border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {title}
        <span className="font-medium">Ciclo {s.cycle} · D{s.day}</span>
        <span className="text-slate-500">{formatDate(s.date)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone[s.status]}`}>
          {s.status === "AGENDADA" && s.releasedAt ? "Liberada" : sessionStatusLabel[s.status]}
        </span>
        {s.status === "AGENDADA" && s.date.getTime() < today.getTime() && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">atrasada</span>}
      </div>
      <ul className="text-slate-700">
        {sessionDoses(s.doses).map((d, i) => (
          <li key={i}>
            <strong>{d.drug}</strong> {d.dose.toLocaleString("pt-BR")} {d.doseUnit} {d.route} <span className="text-xs text-slate-500">({d.prescribed})</span>
          </li>
        ))}
      </ul>
      {s.releasedAt && <p className="text-xs text-slate-500">Liberada por {s.releasedBy && displayName(s.releasedBy)} em {formatDateTime(s.releasedAt)}</p>}
      {s.administeredAt && <p className="text-xs text-emerald-700">Aplicada por {s.administeredBy && displayName(s.administeredBy)} em {formatDateTime(s.administeredAt)}</p>}
      {s.note && <p className="text-xs text-slate-600">{s.note}</p>}
      {open && s.status === "AGENDADA" && (
        <div className="flex flex-wrap gap-3">
          {doctor && !s.releasedAt && releasable && (
            <ActionForm action={releaseSession.bind(null, s.id)} submitLabel="Liberar (exames ok)" className="flex items-end gap-2">{null}</ActionForm>
          )}
          {nursing && s.releasedAt && due && (
            <ActionForm action={administerSession.bind(null, s.id)} submitLabel="Registrar aplicação" className="flex flex-wrap items-end gap-2">
              <input name="note" className="input w-auto! min-w-48" placeholder="Observação (opcional)" aria-label="Observação da aplicação" />
            </ActionForm>
          )}
          {doctor && (
            <details className="text-xs">
              <summary className="cursor-pointer text-marinho-700">Adiar ou cancelar</summary>
              <div className="mt-2 space-y-2">
                <ActionForm action={postponeSession.bind(null, s.id)} submitLabel="Adiar (empurra as próximas)" className="flex flex-wrap items-end gap-2">
                  <input name="newDate" type="date" className="input w-auto!" aria-label="Nova data" required />
                  <input name="reason" className="input w-auto! min-w-48" placeholder="Motivo (ex.: neutropenia)" aria-label="Motivo do adiamento" />
                </ActionForm>
                <ActionForm action={cancelSession.bind(null, s.id)} submitLabel="Cancelar sessão" className="flex flex-wrap items-end gap-2">
                  <input name="reason" className="input w-auto! min-w-48" placeholder="Motivo" aria-label="Motivo do cancelamento" />
                </ActionForm>
              </div>
            </details>
          )}
        </div>
      )}
    </li>
  );
}
