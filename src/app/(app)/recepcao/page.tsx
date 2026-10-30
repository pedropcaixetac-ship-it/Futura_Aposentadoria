import Link from "next/link";
import { notFound } from "next/navigation";
import type { AppointmentStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { canUseReception } from "@/lib/permissions";
import { addDays, appointmentTypeLabel, clinicTime, formatDayLabel, formatTime, formatWait, isValidDate, nextStatuses, occupiesSlot, statusLabel, statusStyle, statusText, today } from "@/lib/agenda";
import { listProfessionals, loadAgenda } from "@/lib/agenda-data";
import { formatDateTime, formatPhone } from "@/lib/format";
import { canMessage } from "@/lib/whatsapp";
import { lastAppAction } from "@/lib/patient-app";
import { prisma } from "@/lib/db";
import { WhatsappLink } from "../agenda/whatsapp-link";
import { returnsToNotify } from "./retornos/data";
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
  const user = await requireUser("recepcao");
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
  const tomorrow = addDays(todayDate, 1);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [toConfirmTomorrow, returns, inApp] = await Promise.all([
    date === todayDate
      ? prisma.appointment.count({
          where: {
            clinicId: user.clinicId,
            status: "AGENDADO",
            confirmationSentAt: null,
            startsAt: { gte: clinicTime(tomorrow, 0), lt: clinicTime(tomorrow, 24 * 60) },
          },
        })
      : 0,
    returnsToNotify(user.clinicId),
    // Consultas futuras que o paciente marcou, remarcou ou desmarcou pelo aplicativo na última semana:
    // a recepção vê para se organizar (e, nas desmarcadas, remarcar ou encaixar outra pessoa).
    prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        startsAt: { gte: new Date() },
        OR: [{ createdInAppAt: { gte: weekAgo } }, { rescheduledInAppAt: { gte: weekAgo } }, { cancelledInAppAt: { gte: weekAgo } }],
      },
      select: {
        id: true,
        startsAt: true,
        status: true,
        professionalId: true,
        createdInAppAt: true,
        rescheduledInAppAt: true,
        cancelledInAppAt: true,
        patient: { select: { name: true, socialName: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 15,
    }),
  ]);
  const pendingReturns = returns.filter((r) => !r.returnNoticeSentAt).length;
  const appChanges = inApp.map((a) => ({ ...a, action: lastAppAction(a) })).filter((a) => a.action);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Recepção</h1>
          <p className="text-sm text-slate-500">{formatDayLabel(date)}{date === todayDate ? " (hoje)" : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/recepcao/mensagens" className="text-sm text-marinho-700 hover:underline">Mensagens do WhatsApp</Link>
          <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm">
            <Link href={`/recepcao?data=${addDays(date, -1)}`} className="bg-white px-3 py-1.5 hover:bg-slate-50" aria-label="Dia anterior">←</Link>
            <Link href="/recepcao" className="border-x border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Hoje</Link>
            <Link href={`/recepcao?data=${addDays(date, 1)}`} className="bg-white px-3 py-1.5 hover:bg-slate-50" aria-label="Próximo dia">→</Link>
          </div>
        </div>
      </div>

      {(toConfirmTomorrow > 0 || pendingReturns > 0) && (
        <div className="flex flex-wrap gap-3 text-sm">
          {toConfirmTomorrow > 0 && (
            <Link href={`/recepcao?data=${tomorrow}`} className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900 hover:bg-emerald-100">
              <strong>{toConfirmTomorrow}</strong> consulta{toConfirmTomorrow > 1 ? "s" : ""} de amanhã para confirmar pelo WhatsApp →
            </Link>
          )}
          {pendingReturns > 0 && (
            <Link href="/recepcao/retornos" className="rounded-md border border-dourado-300 bg-dourado-100 px-3 py-2 text-dourado-700 hover:brightness-95">
              <strong>{pendingReturns}</strong> retorno{pendingReturns > 1 ? "s" : ""} para avisar →
            </Link>
          )}
        </div>
      )}

      {appChanges.length > 0 && (
        <div className="card border-marinho-100 bg-marinho-50/60">
          <h2 className="mb-1 font-semibold text-marinho-900">Feito pelos pacientes no aplicativo</h2>
          <p className="mb-2 text-xs text-marinho-700">Últimos 7 dias. Nas desmarcadas o horário ficou livre: se quiser, ligue para remarcar ou encaixe outra pessoa.</p>
          <ul className="divide-y divide-marinho-100 text-sm">
            {appChanges.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                <span className={`rounded px-1.5 text-xs font-medium ${a.action!.label === "Desmarcou" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {a.action!.label}
                </span>
                <Link href={`/agenda/${a.id}`} className="hover:underline">
                  <span className="font-medium">{formatDateTime(a.startsAt)}</span> · {a.patient.socialName || a.patient.name} · {name.get(a.professionalId)}
                </Link>
                <span className="text-xs text-slate-500">em {formatDateTime(a.action!.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                    {date === todayDate && ` · esperando há ${formatWait(now - a.arrivedAt.getTime())}`}
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
              <th className="px-4 py-2 font-medium">WhatsApp</th>
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
                  {a.teleconsultation && (
                    <p className={`text-xs ${a.teleconsultation.consentAt ? "text-emerald-700" : "text-slate-500"}`}>
                      {a.teleconsultation.patientJoinedAt
                        ? `Vídeo: paciente na sala desde ${formatTime(a.teleconsultation.patientJoinedAt)}`
                        : a.teleconsultation.consentAt
                          ? "Vídeo: paciente aceitou o termo"
                          : "Vídeo: paciente ainda não abriu o link"}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2">{name.get(a.professionalId)}</td>
                <td className="px-4 py-2">
                  <span className={`whitespace-nowrap rounded border-l-4 px-2 py-0.5 text-xs ${statusStyle[a.status]}`}>{statusText(a)}</span>
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
                <td className="px-4 py-2">
                  {a.status === "AGENDADO" && canMessage(a.patient) && (
                    <WhatsappLink
                      small
                      href={`/agenda/${a.id}/whatsapp?modelo=confirmacao`}
                      label="Pedir confirmação"
                      sentAt={a.confirmationSentAt && formatDateTime(a.confirmationSentAt)}
                    />
                  )}
                  {a.status === "AGENDADO" && !canMessage(a.patient) && (
                    <span className="text-xs text-slate-400">Sem autorização</span>
                  )}
                </td>
              </tr>
            ))}
            {appointments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhuma consulta marcada neste dia.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
