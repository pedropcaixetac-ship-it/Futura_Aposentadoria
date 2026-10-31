import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAdministerChemo } from "@/lib/hospital-roles";
import { audit } from "@/lib/audit";
import { isPhysician } from "@/lib/pronto-socorro";
import { kitchenDate as todayDate } from "@/lib/cozinha";
import { age, formatDate, formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { computeDose, protocolDrugs } from "@/lib/quimio";
import { ActionForm } from "../../financeiro/action-form";
import { endPlan } from "../actions";
import { SessionRow } from "../session-row";
import { RecordActions } from "../../assinatura/record-actions";

const people = { select: { name: true, sex: true, jobTitle: true } };

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("quimioterapia");
  const { id } = await params;
  const plan = await prisma.chemoPlan.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      patient: { select: { id: true, name: true, socialName: true, birthDate: true, allergies: true } },
      protocol: true,
      physician: people,
      endedBy: people,
      sessions: { include: { releasedBy: people, administeredBy: people }, orderBy: [{ cycle: "asc" }, { day: "asc" }] },
    },
  });
  if (!plan) notFound();
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_VISUALIZADO", entity: "ChemoPlan", entityId: plan.id, patientId: plan.patient.id });
  const today = todayDate();
  const open = !plan.endedAt;
  const doctor = isPhysician(user);
  const years = age(plan.patient.birthDate);
  const cycles = [...new Set(plan.sessions.map((s) => s.cycle))];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/quimioterapia" className="text-sm text-marinho-700 hover:underline">← Quimioterapia</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{plan.patient.socialName || plan.patient.name}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs ${open ? "bg-marinho-700 text-white" : "bg-slate-200 text-slate-700"}`}>{open ? "Em tratamento" : `Encerrado em ${formatDateTime(plan.endedAt)}`}</span>
        </div>
        {years !== null && <p className="text-sm text-slate-500">{years} anos</p>}
        {plan.patient.allergies && <p className="mt-1 inline-block rounded-md bg-red-50 px-2 py-1 text-sm font-medium text-red-700">Alergias: {plan.patient.allergies}</p>}
      </div>

      <section className="card grid gap-4 text-sm sm:grid-cols-4">
        <div><p className="text-xs uppercase text-slate-500">Protocolo</p><p className="font-medium">{plan.protocol.name}</p><p className="text-slate-500">{plan.cycles} ciclos de {plan.protocol.cycleDays} dias</p></div>
        <div><p className="text-xs uppercase text-slate-500">Medidas</p><p className="font-medium">{plan.heightCm} cm · {plan.weightKg.toLocaleString("pt-BR")} kg</p><p className="text-slate-500">SC {plan.bsa.toLocaleString("pt-BR")} m² (Mosteller)</p></div>
        <div><p className="text-xs uppercase text-slate-500">Dose</p><p className="font-medium">{plan.doseLevel}%</p>{plan.doseLevel !== 100 && <p className="text-amber-700">dose ajustada</p>}</div>
        <div><p className="text-xs uppercase text-slate-500">Médico</p><p className="font-medium">{displayName(plan.physician)}</p><p className="text-slate-500">D1 em {formatDate(plan.startDate)}</p></div>
        <div className="sm:col-span-4">
          <p className="text-xs uppercase text-slate-500">Doses por aplicação</p>
          <ul>
            {protocolDrugs(plan.protocol.drugs).map((d, i) => {
              const dose = computeDose(d, plan);
              return <li key={i}><strong>{d.drug}</strong> {dose.dose.toLocaleString("pt-BR")} {dose.doseUnit} {d.route} ({d.dose.toLocaleString("pt-BR")} {d.unit}) · D{d.days.join(", D")}</li>;
            })}
          </ul>
          {plan.bsa > 2 && <p className="text-amber-700">Superfície corporal acima de 2,0 m²: confira se o protocolo limita a dose.</p>}
        </div>
        {plan.note && <p className="sm:col-span-4 text-slate-600">{plan.note}</p>}
        {plan.endReason && <p className="sm:col-span-4 text-slate-600">Encerrado por {plan.endedBy && displayName(plan.endedBy)}: {plan.endReason}</p>}
      </section>

      {cycles.map((c) => (
        <section key={c} className="space-y-2">
          <h2 className="font-semibold text-marinho-800">Ciclo {c}</h2>
          <ul className="space-y-2">
            {plan.sessions.filter((s) => s.cycle === c).map((s) => (
              <SessionRow
                key={s.id}
                s={s}
                doctor={doctor}
                nursing={canAdministerChemo(user)}
                today={today}
                open={open}
                actions={
                  (s.releasedAt || s.administeredAt) && (
                    <div className="flex flex-wrap gap-4 text-xs">
                      {s.releasedAt && <span className="flex items-center gap-2">Liberação: <RecordActions user={user} type="quimio-liberacao" recordKey={s.id} /></span>}
                      {s.administeredAt && <span className="flex items-center gap-2">Aplicação: <RecordActions user={user} type="quimio-aplicacao" recordKey={s.id} /></span>}
                    </div>
                  )
                }
              />
            ))}
          </ul>
        </section>
      ))}

      {open && doctor && (
        <ActionForm action={endPlan.bind(null, plan.id)} submitLabel="Encerrar tratamento" className="card flex flex-wrap items-end gap-2">
          <div className="grow">
            <label className="label" htmlFor="reason">Encerrar o tratamento (as sessões que faltam serão canceladas)</label>
            <input className="input" id="reason" name="reason" placeholder="Ex.: tratamento concluído, toxicidade, troca de protocolo" />
          </div>
        </ActionForm>
      )}
    </div>
  );
}
