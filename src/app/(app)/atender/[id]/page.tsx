import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canStartFromAppointment } from "@/lib/permissions";
import { appointmentTypeLabel, canCancel, clinicParts, formatDayLabel, formatTime, statusLabel, statusStyle } from "@/lib/agenda";
import { listUsableTemplates } from "@/lib/templates";
import { formatPhone } from "@/lib/format";
import { StartEncounterForm } from "../../agenda/start-encounter-form";

// Consulta vista pelo profissional na aba Atender: dados da consulta e o botão para iniciar.
export default async function AttendAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("atender");
  const { id } = await params;
  const appointment = await prisma.appointment.findFirst({ where: { id, clinicId: user.clinicId }, include: { patient: true } });
  if (!appointment || !canStartFromAppointment(user, appointment)) notFound();

  const { patient } = appointment;
  const canStart = canCancel(appointment.status) && !appointment.encounterId;
  const templates = canStart ? await listUsableTemplates(user) : { mine: [], clinic: [] };

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/atender" className="text-sm text-marinho-700 hover:underline">← Voltar para Atender</Link>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{patient.socialName || patient.name}</h1>
            <p className="text-sm text-slate-600">
              {formatDayLabel(clinicParts(appointment.startsAt).date)} · {formatTime(appointment.startsAt)} às {formatTime(appointment.endsAt)}
            </p>
          </div>
          <span className={`rounded border-l-4 px-3 py-1 text-sm font-medium ${statusStyle[appointment.status]}`}>
            {statusLabel[appointment.status]}
          </span>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Tipo</dt><dd>{appointmentTypeLabel[appointment.type]}</dd></div>
          <div><dt className="text-slate-500">Pagamento</dt><dd>{appointment.insurance ? `Convênio: ${appointment.insurance}` : "Particular"}</dd></div>
          <div><dt className="text-slate-500">Telefone</dt><dd>{formatPhone(patient.phone) || "Não informado"}</dd></div>
          {appointment.arrivedAt && <div><dt className="text-slate-500">Chegou às</dt><dd>{formatTime(appointment.arrivedAt)}</dd></div>}
          {appointment.notes && (
            <div className="sm:col-span-2"><dt className="text-slate-500">Observação</dt><dd className="whitespace-pre-wrap">{appointment.notes}</dd></div>
          )}
        </dl>
      </div>

      <div className="card flex flex-wrap items-center gap-3">
        {appointment.encounterId ? (
          <Link href={`/pacientes/${patient.id}/atendimentos/${appointment.encounterId}`} className="btn-primary">Abrir atendimento</Link>
        ) : canStart ? (
          <StartEncounterForm appointment={appointment} templates={templates} />
        ) : (
          <p className="text-sm text-slate-500">Esta consulta está como &quot;{statusLabel[appointment.status]}&quot; e não pode ser iniciada.</p>
        )}
        <Link href={`/pacientes/${patient.id}`} className="btn-secondary">Ver prontuário</Link>
      </div>
    </div>
  );
}
