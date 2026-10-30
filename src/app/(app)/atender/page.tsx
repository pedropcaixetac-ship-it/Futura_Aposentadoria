import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { appointmentTypeLabel, formatDayLabel, formatTime, today } from "@/lib/agenda";
import { columnFor, listProfessionals, loadAgenda } from "@/lib/agenda-data";
import { listUsableTemplates } from "@/lib/templates";
import { AgendaGrid, StatusLegend } from "../agenda/agenda-grid";
import { StartEncounterForm } from "../agenda/start-encounter-form";

// Tela de trabalho do profissional: quem está esperando por ele e a agenda dele de hoje.
export default async function AttendPage() {
  const user = await requireUser("atender");
  const date = today();
  const [professionals, data, templates] = await Promise.all([
    listProfessionals(user.clinicId),
    loadAgenda(user.clinicId, [user.id], date, date),
    listUsableTemplates(user),
  ]);
  const me = professionals.find((p) => p.id === user.id);
  const column = columnFor(data, user.id, date);
  const waiting = column.appointments
    .filter((a) => a.status === "CHEGOU")
    .sort((a, b) => +(a.arrivedAt ?? a.startsAt) - +(b.arrivedAt ?? b.startsAt));
  const now = Date.now();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Atender</h1>
        <p className="text-sm text-slate-500">{formatDayLabel(date)} (hoje)</p>
      </div>

      <div className="card border-amber-300 bg-amber-50/60">
        <h2 className="mb-2 font-semibold text-amber-900">Sala de espera</h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-slate-500">Não há pacientes aguardando.</p>
        ) : (
          <ul className="divide-y divide-amber-200">
            {waiting.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <Link href={`/atender/${a.id}`} className="font-medium text-marinho-900 hover:underline">
                    {a.patient.socialName || a.patient.name}
                  </Link>
                  <p className="text-slate-600">
                    Marcado às {formatTime(a.startsAt)} · {appointmentTypeLabel[a.type]} · {a.insurance ?? "Particular"}
                    {a.arrivedAt && (
                      <>
                        {" "}· chegou às {formatTime(a.arrivedAt)}, esperando há {Math.max(0, Math.round((now - a.arrivedAt.getTime()) / 60_000))} min
                      </>
                    )}
                  </p>
                  {a.notes && <p className="text-xs text-slate-500">Obs.: {a.notes}</p>}
                </div>
                <StartEncounterForm appointment={a} templates={templates} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <AgendaGrid
        columns={[{ key: user.id, title: me?.name ?? user.name, subtitle: me?.specialty ?? undefined, date, professionalId: user.id, data: column }]}
        canCreate={() => false}
        appointmentHref={(id) => `/atender/${id}`}
      />
      <StatusLegend />
    </div>
  );
}
