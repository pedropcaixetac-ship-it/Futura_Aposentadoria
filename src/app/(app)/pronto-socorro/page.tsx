import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatTime } from "@/lib/agenda";
import { age } from "@/lib/format";
import { canWorkClinical } from "@/lib/permissions";
import { displayName } from "@/lib/staff";
import { compareQueue, minutesBetween, overdue, RISKS, waitLabel, isPhysician } from "@/lib/pronto-socorro";
import { AutoRefresh } from "./auto-refresh";
import { RiskBadge } from "./risk-badge";
import { medicationProgress } from "@/lib/prescricao";


// Painel do pronto-socorro: quem espera triagem, a fila do médico por cor e quem está em atendimento ou observação.
export default async function EmergencyBoard() {
  const user = await requireUser("pronto-socorro");
  const visits = await prisma.emergencyVisit.findMany({
    where: { clinicId: user.clinicId, closedAt: null },
    include: {
      patient: { select: { name: true, socialName: true, birthDate: true } },
      doctor: { select: { name: true, sex: true, jobTitle: true } },
      prescriptionItems: { include: { checks: { select: { scheduledAt: true, canceledAt: true } } } },
    },
    orderBy: { arrivedAt: "asc" },
  });
  const now = new Date();
  const triage = visits.filter((v) => v.status === "AGUARDANDO_TRIAGEM");
  const queue = visits.filter((v) => v.status === "AGUARDANDO_MEDICO").sort(compareQueue);
  const inCare = visits.filter((v) => v.status === "EM_ATENDIMENTO" || v.status === "OBSERVACAO");
  const nurse = canWorkClinical(user);
  const doctor = isPhysician(user);
  const name = (p: { name: string; socialName: string | null }) => p.socialName || p.name;
  const years = (d: Date | null) => (age(d) !== null ? ` · ${age(d)} anos` : "");

  return (
    <div className="max-w-6xl space-y-6">
      <AutoRefresh seconds={30} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pronto-socorro</h1>
          <p className="text-sm text-slate-500">
            {visits.length} paciente(s) no PS agora · {triage.length} aguardando triagem · {queue.length} aguardando médico. A tela se atualiza sozinha.
          </p>
        </div>
        <Link href="/pronto-socorro/chegada" className="btn-primary">Registrar chegada</Link>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {RISKS.map((r) => (
          <span key={r.key} className={`rounded-full px-2 py-0.5 font-medium ${r.className}`}>{r.label}: {r.meaning.split(": ")[1]}</span>
        ))}
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">Aguardando triagem ({triage.length})</h2>
        {triage.length === 0 && <p className="text-sm text-slate-500">Ninguém esperando triagem.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {triage.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <strong>{name(v.patient)}</strong>
                <span className="text-slate-500">{years(v.patient.birthDate)} · chegou às {formatTime(v.arrivedAt)} ({waitLabel(minutesBetween(v.arrivedAt, now))}) · {v.complaint}</span>
              </span>
              {nurse ? (
                <Link href={`/pronto-socorro/${v.id}`} className="btn-primary">Triar</Link>
              ) : (
                <Link href={`/pronto-socorro/${v.id}`} className="text-sm text-marinho-700 hover:underline">Ver</Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">Fila do médico ({queue.length})</h2>
        <p className="text-xs text-slate-500">Em ordem de gravidade; na mesma cor, quem foi triado primeiro. Em vermelho, quem passou do tempo da cor.</p>
        {queue.length === 0 && <p className="text-sm text-slate-500">Ninguém esperando o médico.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {queue.map((v) => {
            const waiting = minutesBetween(v.triagedAt ?? v.arrivedAt, now);
            const late = v.risk && overdue(v.risk, waiting);
            return (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <RiskBadge risk={v.risk} />
                  <strong>{name(v.patient)}</strong>
                  <span className="text-slate-500">{years(v.patient.birthDate)} · {v.complaint}</span>
                  <span className={late ? "font-semibold text-red-700" : "text-slate-500"}>espera {waitLabel(waiting)}</span>
                </span>
                <Link href={`/pronto-socorro/${v.id}`} className={doctor ? "btn-primary" : "text-sm text-marinho-700 hover:underline"}>
                  {doctor ? "Chamar" : "Ver"}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">Em atendimento e em observação ({inCare.length})</h2>
        {inCare.length === 0 && <p className="text-sm text-slate-500">Ninguém em atendimento agora.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {inCare.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex flex-wrap items-center gap-2">
                <RiskBadge risk={v.risk} />
                <strong>{name(v.patient)}</strong>
                <MedicationTag items={v.prescriptionItems} now={now} />
                <span className="text-slate-500">
                  {v.status === "OBSERVACAO" ? "em observação" : "em atendimento"}
                  {v.doctor && ` com ${displayName(v.doctor)}`}
                  {v.calledAt && ` desde ${formatTime(v.calledAt)}`}
                </span>
              </span>
              <Link href={`/pronto-socorro/${v.id}`} className="text-sm text-marinho-700 hover:underline">Abrir</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// Medicação no PS: quantas doses já foram feitas; com tudo feito, o paciente aguarda a reavaliação do médico.
function MedicationTag({ items, now }: { items: Parameters<typeof medicationProgress>[0]; now: Date }) {
  if (!items.length) return null;
  const p = medicationProgress(items, now);
  if (p.waitingReview) return <span className="rounded-full bg-violet-600 px-2 py-0.5 text-xs font-semibold text-white">Aguardando reavaliação</span>;
  if (!p.due) return null;
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Em medicação: {p.done} de {p.due} feitas</span>;
}
