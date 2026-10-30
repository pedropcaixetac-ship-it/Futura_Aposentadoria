import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageAgendaOf, canSeeAllAgendas, canStartFromAppointment, canUseReception } from "@/lib/permissions";
import {
  appointmentTypeLabel,
  canCancel,
  clinicParts,
  formatDayLabel,
  formatMinutes,
  formatTime,
  nextStatuses,
  statusStyle,
  statusText,
} from "@/lib/agenda";
import { listProfessionals } from "@/lib/agenda-data";
import { listUsableTemplates } from "@/lib/templates";
import { formatDate, formatDateTime, formatPhone } from "@/lib/format";
import { canMessage } from "@/lib/whatsapp";
import { WhatsappLink } from "../whatsapp-link";
import { cancelAppointment, saveAppointment, setReturnDue } from "../actions";
import { StartEncounterForm } from "../start-encounter-form";
import { AppointmentForm } from "../appointment-form";
import { CopyLink } from "../copy-link";
import { teleconsultationPath, teleconsultationState } from "@/lib/teleconsulta";
import { siteOrigin } from "@/lib/teleconsulta-sala";
import { displayName } from "@/lib/staff";

export default async function AppointmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ remarcar?: string }> }) {
  const user = await requireUser("agenda");
  const { id } = await params;
  const { remarcar } = await searchParams;
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { patient: true, professional: true, createdBy: true, teleconsultation: true },
  });
  if (!appointment || !canManageAgendaOf(user, appointment.professionalId)) notFound();

  const { patient } = appointment;
  const start = clinicParts(appointment.startsAt);
  const duration = Math.round((appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000);
  const canStart = canStartFromAppointment(user, appointment) && (canCancel(appointment.status) || !!appointment.encounterId);
  const editable = canCancel(appointment.status);
  const [templates, professionals] = await Promise.all([
    canStart && !appointment.encounterId
      ? listUsableTemplates(user)
      : { mine: [], clinic: [] },
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
            {statusText(appointment)}
          </span>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Profissional</dt><dd>{displayName(appointment.professional)}</dd></div>
          <div><dt className="text-slate-500">Tipo</dt><dd>{appointmentTypeLabel[appointment.type]}</dd></div>
          <div><dt className="text-slate-500">Pagamento</dt><dd>{appointment.insurance ? `Convênio: ${appointment.insurance}` : "Particular"}</dd></div>
          <div><dt className="text-slate-500">Telefone</dt><dd>{formatPhone(patient.phone) || "Não informado"}</dd></div>
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
        <p className="text-xs text-slate-400">Marcado por {displayName(appointment.createdBy)} em {formatDateTime(appointment.createdAt)}</p>
      </div>

      {canStart && (
        <div className="card space-y-3 border-marinho-400">
          <h2 className="font-semibold">Atendimento</h2>
          {appointment.encounterId ? (
            <Link href={`/pacientes/${patient.id}/atendimentos/${appointment.encounterId}`} className="btn-primary">Abrir atendimento</Link>
          ) : (
            <StartEncounterForm appointment={appointment} templates={templates} />
          )}
        </div>
      )}

      {appointment.teleconsultation && appointment.status !== "DESMARCADO" && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Teleconsulta (vídeo)</h2>
          {["AGUARDANDO_TERMO", "LIBERADA"].includes(teleconsultationState(appointment.teleconsultation)) ? (
            <>
              <p className="text-sm text-slate-500">
                Este é o link da chamada. Ele já vai junto com o pedido de confirmação pelo WhatsApp. No horário, o paciente
                abre o link, aceita o termo e espera o profissional entrar.
              </p>
              <CopyLink link={`${await siteOrigin()}${teleconsultationPath(appointment.teleconsultation.token)}`} />
            </>
          ) : (
            <p className="text-sm text-slate-500">O link desta teleconsulta não funciona mais (encerrada ou expirada).</p>
          )}
          <p className={`text-sm ${appointment.teleconsultation.consentAt ? "text-emerald-700" : "text-slate-500"}`}>
            {appointment.teleconsultation.consentAt
              ? `Paciente aceitou o termo em ${formatDateTime(appointment.teleconsultation.consentAt)}.`
              : "O paciente ainda não abriu o link."}
          </p>
        </div>
      )}

      {appointment.status === "AGENDADO" && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Confirmação pelo WhatsApp</h2>
            <p className="text-sm text-slate-500">
              {canMessage(patient)
                ? "Abre o WhatsApp com a mensagem pronta. Quando o paciente responder, marque \"Confirmou\" na Recepção."
                : "O paciente não autorizou mensagens pelo WhatsApp ou o celular dele não tem WhatsApp. Isso se muda no cadastro."}
            </p>
          </div>
          {canMessage(patient) && (
            <WhatsappLink
              href={`/agenda/${id}/whatsapp?modelo=confirmacao`}
              label="Pedir confirmação"
              sentAt={appointment.confirmationSentAt && formatDateTime(appointment.confirmationSentAt)}
            />
          )}
        </div>
      )}

      {appointment.status !== "DESMARCADO" && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Retorno</h2>
          {appointment.returnDueOn ? (
            <p className="text-sm">
              Retorno previsto para <strong>{formatDate(appointment.returnDueOn)}</strong>. A recepção verá este paciente em
              &quot;Retornos para avisar&quot; duas semanas antes, até ele marcar.
              {appointment.returnNoticeSentAt && (
                <span className="text-emerald-700"> Aviso enviado em {formatDateTime(appointment.returnNoticeSentAt)}.</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Se o paciente precisa voltar, anote quando. A recepção é lembrada de avisá-lo.</p>
          )}
          <form action={setReturnDue.bind(null, id)} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor="days">Retorno em</label>
              <select className="input w-auto!" id="days" name="days" defaultValue="">
                <option value="">Escolher data...</option>
                {[7, 15, 30, 60, 90, 180, 365].map((d) => (
                  <option key={d} value={d}>{d === 365 ? "1 ano" : `${d} dias`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="date">ou na data</label>
              <input className="input" id="date" name="date" type="date" />
            </div>
            <button className="btn-secondary">{appointment.returnDueOn ? "Alterar retorno" : "Anotar retorno"}</button>
            {appointment.returnDueOn && (
              <button name="clear" value="1" className="text-sm text-slate-500 hover:underline">Sem retorno</button>
            )}
          </form>
        </div>
      )}

      <div className="card space-y-4">
        {canUseReception(user) && nextStatuses(appointment.status).length > 0 && (
          <p className="text-sm text-slate-500">
            Confirmação, chegada e falta são marcadas na{" "}
            <Link href={`/recepcao?data=${start.date}`} className="text-marinho-700 hover:underline">Recepção</Link>.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
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
