import Link from "next/link";
import { notFound } from "next/navigation";
import type { AppointmentStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canUseReception } from "@/lib/permissions";
import { addDays, appointmentTypeLabel, formatDayLabel, formatTime, isValidDate, nextStatuses, occupiesSlot, statusLabel, statusStyle, today } from "@/lib/agenda";
import { listProfessionals, loadAgenda } from "@/lib/agenda-data";
import { formatPhone } from "@/lib/format";
import { setAppointmentStatus } from "../agenda/actions";

// Texto do botão para cada mudança de situação. Voltar atrás aparece como "Desfazer".
function buttonLabel(from: AppointmentStatus, to: AppointmentStatus) {
  if (to === "AGENDADO" || (from === "CHEGOU" && to === "CONFIRMADO")) return "Desfazer";
  return { CONFIRMADO: "Confirmou", CHEGOU: "Chegou", FALTOU: "Faltou" }[to as string] ?? statusLabel[to];
}

const buttonStyle: Partial<Record<AppointmentStatus, string>> = {
  CONFIRMADO: "border-emerald-400 text-emerald-800 hover:bg-emerald-50",
  CHEGOU: "border-amber-500 bg-amber-500 text-white hover:bg-amber-600",
  FALTOU: "border-red-300 text-red-700 hover:bg-red-50",
};

export default async function ReceptionPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const user = await requireUser();
  if (!canUseReception(user)) notFound();
  const { data } = await searchParams;
  const todayDate = today();
  const date = isValidDate(data) ? data : todayDate;

  const professionals = await listProfessionals(user.clinicId);
  const name = new Map(professionals.map((p) => [p.id, p.name]));
  const { appointments } = await loadAgenda(user.clinicId, professionals.map((p) => p.id), date, date);
  const active = appointments.filter((a) => occupiesSlot(a.status));
  const waiting = active.filter((a) => a.status === "CHEGOU").sort((a, b) => +(a.arrivedAt ?? 0) - +(b.arrivedAt ?? 0));
  const count = (s: AppointmentStatus[]) => active.filter((a) => s.includes(a.status)).length;
  const now = Date.now();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Recepção</h1>
          <p className="text-sm text-slate-500">{formatDayLabel(date)}{date === todayDate ? " (hoje)" : ""}</p>
        </div>
        <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm">
          <Link href={`/recepcao?data=${addDays(date, -1)}`} className="bg-white px-3 py-1.5 hover:bg-slate-50" aria-label="Dia anterior">←</Link>
          <Link href="/recepcao" className="border-x border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Hoje</Link>
          <Link href={`/recepcao?data=${addDays(date, 1)}`} className="bg-white px-3 py-1.5 hover:bg-slate-50" aria-label="Próximo dia">→</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Pacientes do dia", active.length],
          ["Aguardando chegada", count(["AGENDADO", "CONFIRMADO"])],
          ["Na sala de espera", waiting.length],
          ["Atendidos", count(["EM_ATENDIMENTO", "ATENDIDO"])],
        ].map(([label, value]) => (
          <div key={label} className="card py-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-2xl font-semibold text-marinho-900">{value}</p>
          </div>
        ))}
      </div>

      {waiting.length > 0 && (
        <div className="card border-amber-300 bg-amber-50/60">
          <h2 className="mb-2 font-semibold text-amber-900">Sala de espera</h2>
          <ul className="divide-y divide-amber-200 text-sm">
            {waiting.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{a.patient.socialName || a.patient.name}</span>
                  <span className="text-slate-600"> · {name.get(a.professionalId)} · marcado às {formatTime(a.startsAt)}</span>
                </span>
                {a.arrivedAt && (
                  <span className="text-amber-900">
                    chegou às {formatTime(a.arrivedAt)}
                    {date === todayDate && ` · esperando há ${Math.max(0, Math.round((now - a.arrivedAt.getTime()) / 60_000))} min`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Horário</th>
              <th className="px-4 py-2 font-medium">Paciente</th>
              <th className="px-4 py-2 font-medium">Profissional</th>
              <th className="px-4 py-2 font-medium">Situação</th>
              <th className="px-4 py-2 font-medium">Presença</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => (
              <tr key={a.id} className="border-t border-slate-100 align-middle">
                <td className="px-4 py-2 font-medium">{formatTime(a.startsAt)}</td>
                <td className="px-4 py-2">
                  <Link href={`/agenda/${a.id}`} className="font-medium text-marinho-800 hover:underline">
                    {a.patient.socialName || a.patient.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {[formatPhone(a.patient.phone), appointmentTypeLabel[a.type], a.insurance ?? "Particular"].filter(Boolean).join(" · ")}
                  </p>
                </td>
                <td className="px-4 py-2">{name.get(a.professionalId)}</td>
                <td className="px-4 py-2">
                  <span className={`whitespace-nowrap rounded border-l-4 px-2 py-0.5 text-xs ${statusStyle[a.status]}`}>{statusLabel[a.status]}</span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {nextStatuses(a.status).map((s) => {
                      const undo = buttonLabel(a.status, s) === "Desfazer";
                      return (
                        <form key={s} action={setAppointmentStatus.bind(null, a.id, s)}>
                          <button
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${undo ? "border-slate-300 text-slate-500 hover:bg-slate-50" : buttonStyle[s] ?? "border-slate-300"}`}
                          >
                            {buttonLabel(a.status, s)}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
            {appointments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhuma consulta marcada neste dia.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
