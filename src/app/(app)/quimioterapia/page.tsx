import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canWorkClinical } from "@/lib/permissions";
import { isPhysician } from "@/lib/pronto-socorro";
import { kitchenDate as todayDate } from "@/lib/cozinha";
import { formatDate } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { ChemoNav } from "./nav";
import { SessionRow } from "./session-row";

const people = { select: { name: true, sex: true, jobTitle: true } };

// Quimioterapia: as sessões de hoje (e atrasadas), as dos próximos dias e os tratamentos em andamento.
export default async function ChemoPage() {
  const user = await requireUser("quimioterapia");
  const today = todayDate();
  const week = new Date(today.getTime() + 7 * 24 * 3600_000);
  const [sessions, plans] = await Promise.all([
    prisma.chemoSession.findMany({
      where: { clinicId: user.clinicId, plan: { endedAt: null }, OR: [{ date: today }, { date: { lt: today }, status: "AGENDADA" }, { date: { gt: today, lte: week }, status: "AGENDADA" }] },
      include: { patient: { select: { name: true, socialName: true, allergies: true } }, plan: { select: { id: true, protocol: { select: { name: true } } } }, releasedBy: people, administeredBy: people },
      orderBy: [{ date: "asc" }, { cycle: "asc" }],
    }),
    prisma.chemoPlan.findMany({
      where: { clinicId: user.clinicId, endedAt: null },
      include: { patient: { select: { name: true, socialName: true } }, protocol: { select: { name: true } }, physician: people, sessions: { select: { status: true, cycle: true, date: true } } },
      orderBy: { startDate: "desc" },
    }),
  ]);
  const doctor = isPhysician(user);
  const nursing = canWorkClinical(user);
  const now = sessions.filter((s) => s.date.getTime() <= today.getTime());
  const next = sessions.filter((s) => s.date.getTime() > today.getTime());
  const title = (s: (typeof sessions)[number]) => (
    <Link href={`/quimioterapia/${s.plan.id}`} className="font-semibold text-marinho-700 hover:underline">
      {s.patient.socialName || s.patient.name} · {s.plan.protocol.name}
    </Link>
  );

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Quimioterapia</h1>
        <p className="text-sm text-slate-500">O médico libera a sessão depois de conferir os exames; a enfermagem registra a aplicação. As doses já vêm calculadas pela superfície corporal.</p>
      </div>
      <ChemoNav current="hoje" />

      <section className="space-y-2">
        <h2 className="font-semibold text-marinho-800">Hoje ({formatDate(today)})</h2>
        {now.length === 0 && <p className="card text-sm text-slate-500">Nenhuma sessão para hoje.</p>}
        <ul className="space-y-3">
          {now.map((s) => (
            <SessionRow key={s.id} s={s} doctor={doctor} nursing={nursing} today={today} open title={title(s)} />
          ))}
        </ul>
        {now.some((s) => s.patient.allergies) && <p className="text-xs text-red-700">Confira as alergias na ficha do paciente antes de aplicar.</p>}
      </section>

      {next.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-marinho-800">Próximos 7 dias</h2>
          <ul className="space-y-1 text-sm">
            {next.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-2">
                <span className="w-24 text-slate-500">{formatDate(s.date)}</span>
                {title(s)}
                <span>Ciclo {s.cycle} · D{s.day}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="font-semibold text-marinho-800">Tratamentos em andamento ({plans.length})</h2>
        {plans.length === 0 && <p className="text-sm text-slate-500">Nenhum tratamento em andamento.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {plans.map((p) => {
            const done = p.sessions.filter((s) => s.status === "REALIZADA").length;
            const total = p.sessions.filter((s) => s.status !== "CANCELADA").length;
            const nextSession = p.sessions.filter((s) => s.status === "AGENDADA").sort((a, b) => a.date.getTime() - b.date.getTime())[0];
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/quimioterapia/${p.id}`} className="font-medium text-marinho-700 hover:underline">{p.patient.socialName || p.patient.name} · {p.protocol.name}</Link>
                <span className="text-slate-600">
                  {done} de {total} sessões{nextSession && ` · próxima ${formatDate(nextSession.date)} (ciclo ${nextSession.cycle})`} · {displayName(p.physician)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
