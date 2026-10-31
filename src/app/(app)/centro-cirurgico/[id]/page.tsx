import Link from "next/link";
import { notFound } from "next/navigation";
import type { ChecklistPhase } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canViewClinical, canWorkClinical } from "@/lib/permissions";
import { age, formatDate, formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { anesthesiaLabel, CHECKLIST, durationLabel, minutesBetween, missingChecklist, nextStep, PHASES, STEPS } from "@/lib/centro-cirurgico";
import { packageState, usable } from "@/lib/cme";
import { ActionForm } from "../../financeiro/action-form";
import { cancelSurgery, recordStep, saveChecklist, saveOperativeNote, usePackage } from "../actions";
import { SurgeryBadge } from "../status-badge";

const people = { select: { name: true, sex: true, jobTitle: true } };

export default async function SurgeryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("centro-cirurgico");
  const { id } = await params;
  const surgery = await prisma.surgery.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      patient: { select: { id: true, name: true, socialName: true, birthDate: true, allergies: true } },
      admission: { select: { id: true, bed: { select: { code: true, ward: { select: { name: true } } } } } },
      room: true,
      surgeon: people,
      anesthetist: people,
      createdBy: people,
      canceledBy: people,
      checklists: { include: { doneBy: people } },
      packages: { include: { kit: true, load: { select: { code: true, method: true } } } },
    },
  });
  if (!surgery) notFound();
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_VISUALIZADO", entity: "Surgery", entityId: surgery.id, patientId: surgery.patient.id });
  const team = canWorkClinical(user);
  const running = surgery.status === "AGENDADA" || surgery.status === "EM_SALA";
  const hasAnesthesia = !!surgery.anesthesia && surgery.anesthesia !== "LOCAL";
  const done = surgery.checklists.map((c) => c.phase);
  const step = running ? nextStep(surgery, hasAnesthesia) : null;
  const missing = missingChecklist(step, done, hasAnesthesia);
  // Mostra a etapa da cirurgia segura quando chega a hora dela.
  const phaseDue = (phase: ChecklistPhase) =>
    surgery.status === "EM_SALA" && !done.includes(phase) && (phase === "ENTRADA" || (phase === "PAUSA" && (surgery.anesthesiaAt || !hasAnesthesia)) || (phase === "SAIDA" && surgery.endAt));
  const nextPhase = PHASES.find((p) => !done.includes(p));
  const available = team && running
    ? (await prisma.sterilePackage.findMany({
        where: { clinicId: user.clinicId, usedAt: null, discardedAt: null, expiresAt: { gt: new Date() }, load: { result: "LIBERADA" } },
        include: { kit: true, load: { select: { code: true, result: true } } },
        orderBy: { expiresAt: "asc" },
      })).filter((p) => usable(packageState(p, p.load)))
    : [];
  const years = age(surgery.patient.birthDate);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href={`/centro-cirurgico?data=${new Date(surgery.scheduledAt.getTime() - 3 * 3600_000).toISOString().slice(0, 10)}`} className="text-sm text-marinho-700 hover:underline">← Mapa cirúrgico</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{surgery.patient.socialName || surgery.patient.name}</h1>
          <SurgeryBadge status={surgery.status} />
        </div>
        <p className="text-sm text-slate-500">
          {[years !== null && `${years} anos`, surgery.admission && `${surgery.admission.bed.ward.name} · leito ${surgery.admission.bed.code}`].filter(Boolean).join(" · ")}
        </p>
        {surgery.patient.allergies && <p className="mt-1 inline-block rounded-md bg-red-50 px-2 py-1 text-sm font-medium text-red-700">Alergias: {surgery.patient.allergies}</p>}
      </div>

      <section className="card grid gap-4 text-sm sm:grid-cols-3">
        <div className="sm:col-span-3">
          <p className="text-xs uppercase text-slate-500">Cirurgia</p>
          <p className="text-base font-semibold">{surgery.procedure}{surgery.laterality && <span className="ml-2 rounded bg-amber-100 px-1.5 text-sm text-amber-900">Lado {surgery.laterality.toLowerCase()}</span>}</p>
        </div>
        <div><p className="text-xs uppercase text-slate-500">Quando</p><p className="font-medium">{formatDateTime(surgery.scheduledAt)}</p><p className="text-slate-500">{surgery.room.name} · previsto {durationLabel(surgery.expectedMinutes)}</p></div>
        <div><p className="text-xs uppercase text-slate-500">Equipe</p><p className="font-medium">{displayName(surgery.surgeon)}</p><p className="text-slate-500">Anestesista: {surgery.anesthetist ? displayName(surgery.anesthetist) : "a definir"}</p></div>
        <div><p className="text-xs uppercase text-slate-500">Anestesia</p><p className="font-medium">{surgery.anesthesia ? anesthesiaLabel[surgery.anesthesia] : "—"}</p></div>
        {surgery.note && <p className="text-slate-600 sm:col-span-3">{surgery.note}</p>}
        {surgery.canceledAt && <p className="text-slate-600 sm:col-span-3">Suspensa por {surgery.canceledBy && displayName(surgery.canceledBy)} em {formatDateTime(surgery.canceledAt)}: {surgery.cancelReason}</p>}
      </section>

      {surgery.status !== "CANCELADA" && (
        <section className="card space-y-3">
          <h2 className="font-semibold text-marinho-800">Tempos da cirurgia</h2>
          <ol className="grid gap-2 text-sm sm:grid-cols-5">
            {STEPS.filter((s) => s.key !== "anesthesiaAt" || hasAnesthesia).map((s) => (
              <li key={s.key} className={`rounded-md border p-2 ${surgery[s.key] ? "border-emerald-200 bg-emerald-50" : step?.key === s.key ? "border-dourado-400" : "border-slate-200"}`}>
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="font-medium">{surgery[s.key] ? formatDateTime(surgery[s.key]).slice(-5) : "—"}</p>
              </li>
            ))}
          </ol>
          <p className="text-sm text-slate-600">
            Tempo cirúrgico: {durationLabel(minutesBetween(surgery.incisionAt, surgery.endAt))} · Tempo de sala: {durationLabel(minutesBetween(surgery.patientInAt, surgery.patientOutAt))}
          </p>
          {team && step && (missing ? (
            <p className="text-sm text-amber-800">Próximo: {step.label}. Antes, faça a etapa &quot;{CHECKLIST[missing].label}&quot; da cirurgia segura (abaixo).</p>
          ) : (
            <ActionForm action={recordStep.bind(null, surgery.id, step.key)} submitLabel={`Registrar agora: ${step.label}`} className="flex">{null}</ActionForm>
          ))}
        </section>
      )}

      {surgery.status !== "CANCELADA" && (
        <section className="card space-y-3">
          <h2 className="font-semibold text-marinho-800">Cirurgia segura (OMS)</h2>
          {surgery.status === "AGENDADA" && <p className="text-sm text-slate-500">Começa quando o paciente entra na sala.</p>}
          {PHASES.map((phase) => {
            const record = surgery.checklists.find((c) => c.phase === phase);
            if (record) {
              return (
                <details key={phase} className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm">
                  <summary className="cursor-pointer font-medium text-emerald-800">✓ {CHECKLIST[phase].label} · {displayName(record.doneBy)}, {formatDateTime(record.doneAt)}</summary>
                  <ul className="mt-1 list-disc pl-5 text-slate-700">{CHECKLIST[phase].items.map((i) => <li key={i}>{i}</li>)}</ul>
                  {record.note && <p className="mt-1 text-slate-600">{record.note}</p>}
                </details>
              );
            }
            if (team && phase === nextPhase && phaseDue(phase)) {
              return (
                <ActionForm key={phase} action={saveChecklist.bind(null, surgery.id, phase)} submitLabel="Confirmar etapa" className="space-y-2 rounded-md border border-dourado-400 p-3">
                  <p className="font-medium">{CHECKLIST[phase].label}</p>
                  {CHECKLIST[phase].items.map((item, i) => (
                    <label key={item} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name={`item${i}`} className="mt-1" /> {item}
                    </label>
                  ))}
                  <input name="note" className="input" placeholder="Observação (opcional)" aria-label="Observação da etapa" />
                </ActionForm>
              );
            }
            return <p key={phase} className="text-sm text-slate-400">○ {CHECKLIST[phase].label}</p>;
          })}
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">Material esterilizado (CME)</h2>
        {surgery.packages.length === 0 && <p className="text-sm text-slate-500">Nenhum pacote registrado.</p>}
        <ul className="text-sm">
          {surgery.packages.map((p) => (
            <li key={p.id}>{p.kit.name} · carga <Link href={`/cme/carga/${p.loadId}`} className="text-marinho-700 hover:underline">{p.load.code}</Link> · validade {formatDate(p.expiresAt)}</li>
          ))}
        </ul>
        {available.length > 0 && (
          <ActionForm action={usePackage.bind(null, surgery.id)} submitLabel="Registrar pacote" className="flex flex-wrap items-end gap-2">
            <select name="packageId" className="input w-auto! min-w-72" defaultValue="" required aria-label="Pacote">
              <option value="" disabled>Pacote liberado pela CME</option>
              {available.map((p) => <option key={p.id} value={p.id}>{p.kit.name} · carga {p.load.code} · vence {formatDate(p.expiresAt)}</option>)}
            </select>
          </ActionForm>
        )}
        {team && running && available.length === 0 && <p className="text-sm text-amber-700">Nenhum pacote liberado e na validade na CME.</p>}
      </section>

      {canViewClinical(user) && (surgery.operativeNote || (surgery.surgeonId === user.id && surgery.endAt)) && (
        <section className="card space-y-2">
          <h2 className="font-semibold text-marinho-800">Descrição cirúrgica</h2>
          {surgery.operativeNote ? (
            <p className="whitespace-pre-line text-sm">{surgery.operativeNote}</p>
          ) : (
            <ActionForm action={saveOperativeNote.bind(null, surgery.id)} submitLabel="Salvar descrição">
              <textarea name="operativeNote" className="input min-h-40" placeholder="Achados, técnica, intercorrências, material enviado para exame..." aria-label="Descrição cirúrgica" />
            </ActionForm>
          )}
        </section>
      )}

      {surgery.status === "AGENDADA" && (
        <ActionForm action={cancelSurgery.bind(null, surgery.id)} submitLabel="Suspender cirurgia" className="card flex flex-wrap items-end gap-2">
          <div className="grow">
            <label className="label" htmlFor="reason">Suspender (motivo)</label>
            <input className="input" id="reason" name="reason" placeholder="Ex.: paciente sem jejum, falta de vaga na UTI" />
          </div>
        </ActionForm>
      )}
      <p className="text-xs text-slate-500">Agendada por {displayName(surgery.createdBy)} em {formatDateTime(surgery.createdAt)}.</p>
    </div>
  );
}
