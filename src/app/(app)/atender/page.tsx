import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { availableProviders } from "@/lib/signature/providers";
import { appointmentTypeLabel, formatDayLabel, formatTime, formatWait, today } from "@/lib/agenda";
import { columnFor, listProfessionals, loadAgenda } from "@/lib/agenda-data";
import { listUsableTemplates } from "@/lib/templates";
import { AgendaGrid, StatusLegend } from "../agenda/agenda-grid";
import { StartEncounterForm } from "../agenda/start-encounter-form";

// Tela de trabalho do profissional: quem está esperando por ele e a agenda dele de hoje.
export default async function AttendPage({ searchParams }: { searchParams: Promise<{ finalizado?: string }> }) {
  const user = await requireUser("atender");
  const { finalizado } = await searchParams;
  const date = today();
  const [professionals, data, templates, finished] = await Promise.all([
    listProfessionals(user.clinicId),
    loadAgenda(user.clinicId, [user.id], date, date),
    listUsableTemplates(user),
    // Atendimento que acabou de ser finalizado, para o aviso no topo.
    finalizado
      ? prisma.encounter.findFirst({
          where: { id: finalizado, clinicId: user.clinicId, professionalId: user.id, status: "FINALIZADO" },
          select: { id: true, patientId: true, signedPdf: { select: { id: true } }, patient: { select: { name: true, socialName: true } } },
        })
      : null,
  ]);
  const canSign = availableProviders().length > 0;
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

      {finished && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          ✓ Atendimento de {finished.patient.socialName || finished.patient.name} finalizado.
          {!finished.signedPdf && canSign && (
            <>
              {" "}Falta assinar o registro:{" "}
              <Link href={`/pacientes/${finished.patientId}/atendimentos/${finished.id}`} className="font-medium underline">abrir para assinar</Link>.
            </>
          )}
        </p>
      )}

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
                        {" "}· chegou às {formatTime(a.arrivedAt)}, esperando há {formatWait(now - a.arrivedAt.getTime())}
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
