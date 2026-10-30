import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageAgendaOf, canSeeAllAgendas, canStartFromAppointment } from "@/lib/permissions";
import {
  appointmentTypeLabel,
  canCancel,
  clinicParts,
  formatDayLabel,
  formatMinutes,
  formatTime,
  nextStatuses,
  statusLabel,
  statusStyle,
} from "@/lib/agenda";
import { listProfessionals } from "@/lib/agenda-data";
import { formatDateTime } from "@/lib/format";
import { cancelAppointment, saveAppointment, setAppointmentStatus, startFromAppointment } from "../actions";
import { AppointmentForm } from "../appointment-form";

const statusAction: Partial<Record<string, string>> = {
  CONFIRMADO: "Confirmar presença",
  CHEGOU: "Paciente chegou",
  FALTOU: "Faltou",
  AGENDADO: "Voltar para agendado",
};

export default async function AppointmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ remarcar?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { remarcar } = await searchParams;
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { patient: true, professional: true, createdBy: true },
  });
  if (!appointment || !canManageAgendaOf(user, appointment.professionalId)) notFound();

  const { patient } = appointment;
  const start = clinicParts(appointment.startsAt);
  const duration = Math.round((appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000);
  const canStart = canStartFromAppointment(user, appointment) && (canCancel(appointment.status) || !!appointment.encounterId);
  const editable = canCancel(appointment.status);
  const [templates, professionals] = await Promise.all([
    canStart && !appointment.encounterId
      ? prisma.recordTemplate.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } })
      : [],
    remarcar && editable ? listProfessionals(user.clinicId) : [],
  ]);

  if (remarcar && editable) {
    return (
      <div className="max-w-3xl space-y-4">
        <div>
          <Link href={`/agenda/${id}`} className="text-sm text-marinho-700 hover:underline">← Voltar</Link>
          <h1 className="mt-1 text-2xl font-semibold">Remarcar ou alterar consulta</h1>
        </div>
        <AppointmentForm
          action={saveAppointment.bind(null, id)}
          professionals={canSeeAllAgendas(user) ? professionals : professionals.filter((p) => p.id === user.id)}
          patient={{ id: patient.id, name: patient.socialName || patient.name, phone: patient.phone, insurance: patient.insurance }}
          lockPatient
          submitLabel="Salvar alterações"
          defaults={{
            professionalId: appointment.professionalId,
            date: start.date,
            time: formatMinutes(start.minutes),
            duration,
            type: appointment.type,
            insurance: appointment.insurance,
            notes: appointment.notes,
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Link href={`/agenda?data=${start.date}`} className="text-sm text-marinho-700 hover:underline">← Voltar à agenda</Link>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{patient.socialName || patient.name}</h1>
            <p className="text-sm text-slate-600">
              {formatDayLabel(start.date)} · {formatTime(appointment.startsAt)} às {formatTime(appointment.endsAt)} ({duration} min)
            </p>
          </div>
          <span className={`rounded border-l-4 px-3 py-1 text-sm font-medium ${statusStyle[appointment.status]}`}>
            {statusLabel[appointment.status]}
          </span>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Profissional</dt><dd>{appointment.professional.name}</dd></div>
          <div><dt className="text-slate-500">Tipo</dt><dd>{appointmentTypeLabel[appointment.type]}</dd></div>
          <div><dt className="text-slate-500">Pagamento</dt><dd>{appointment.insurance ? `Convênio: ${appointment.insurance}` : "Particular"}</dd></div>
          <div><dt className="text-slate-500">Telefone</dt><dd>{patient.phone || "Não informado"}</dd></div>
          {appointment.notes && (
            <div className="sm:col-span-2"><dt className="text-slate-500">Observação</dt><dd className="whitespace-pre-wrap">{appointment.notes}</dd></div>
          )}
          {appointment.arrivedAt && (
            <div><dt className="text-slate-500">Chegou às</dt><dd>{formatTime(appointment.arrivedAt)}</dd></div>
          )}
          {appointment.cancelReason && (
            <div><dt className="text-slate-500">Motivo da desmarcação</dt><dd>{appointment.cancelReason}</dd></div>
          )}
        </dl>
        <p className="text-xs text-slate-400">Marcado por {appointment.createdBy.name} em {formatDateTime(appointment.createdAt)}</p>
      </div>

      {canStart && (
        <div className="card space-y-3 border-marinho-400">
          <h2 className="font-semibold">Atendimento</h2>
          {appointment.encounterId ? (
            <Link href={`/pacientes/${patient.id}/atendimentos/${appointment.encounterId}`} className="btn-primary">Abrir atendimento</Link>
          ) : (
            <form action={startFromAppointment.bind(null, id)} className="flex flex-wrap items-center gap-2">
              <select name="templateId" aria-label="Modelo de atendimento" className="input w-auto!" defaultValue={appointment.type === "RETORNO" ? templates.find((t) => t.name === "Retorno")?.id : ""}>
                <option value="">Evolução livre</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button className="btn-primary">Iniciar atendimento</button>
            </form>
          )}
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-wrap gap-2">
          {nextStatuses(appointment.status).map((s) => (
            <form key={s} action={setAppointmentStatus.bind(null, id, s)}>
              <button className={s === "CHEGOU" || s === "CONFIRMADO" ? "btn-primary" : "btn-secondary"}>{statusAction[s]}</button>
            </form>
          ))}
          {editable && <Link href={`/agenda/${id}?remarcar=1`} className="btn-secondary">Remarcar ou alterar</Link>}
          <Link href={`/pacientes/${patient.id}`} className="btn-secondary">Ver cadastro do paciente</Link>
        </div>

        {editable && (
          <form action={cancelAppointment.bind(null, id)} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
            <div className="min-w-60 flex-1">
              <label className="label" htmlFor="cancelReason">Desmarcar consulta</label>
              <input className="input" id="cancelReason" name="cancelReason" placeholder="Motivo (opcional)" />
            </div>
            <button className="btn border border-red-300 bg-white text-red-700 hover:bg-red-50">Desmarcar</button>
          </form>
        )}
      </div>
    </div>
  );
}
