import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { age, formatDateTime } from "@/lib/format";
import { canOpenEncounter, canWorkClinical } from "@/lib/permissions";
import { displayName } from "@/lib/staff";
import { listUsableTemplates } from "@/lib/templates";
import { vitalFields, vitalsSummary, type Vitals } from "@/lib/vitals";
import { minutesBetween, outcomeLabel, RISKS, statusLabel, waitLabel, isPhysician } from "@/lib/pronto-socorro";
import { ActionForm } from "../../financeiro/action-form";
import { callPatient, closeVisit, triageVisit } from "../actions";
import { RiskBadge } from "../risk-badge";

const triageFields = vitalFields.filter((f) => f.key !== "altura");
const staff = { select: { name: true, sex: true, jobTitle: true } } as const;

export default async function EmergencyVisitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ jaChamado?: string }> }) {
  const user = await requireUser("pronto-socorro");
  const { id } = await params;
  const { jaChamado } = await searchParams;
  const visit = await prisma.emergencyVisit.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      patient: { select: { id: true, name: true, socialName: true, birthDate: true, allergies: true } },
      registeredBy: staff,
      triagedBy: staff,
      doctor: staff,
      closedBy: staff,
      encounter: { select: { id: true, professionalId: true, status: true } },
    },
  });
  if (!visit) notFound();

  const nurse = canWorkClinical(user);
  const doctor = isPhysician(user);
  const open = !visit.closedAt;
  const waitingDoctor = visit.status === "AGUARDANDO_TRIAGEM" || visit.status === "AGUARDANDO_MEDICO";
  const templates = doctor && open && waitingDoctor ? await listUsableTemplates(user) : { mine: [], clinic: [] };
  const years = age(visit.patient.birthDate);
  const v = visit.triageVitals as Vitals | null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/pronto-socorro" className="text-sm text-marinho-700 hover:underline">← Painel do pronto-socorro</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{visit.patient.socialName || visit.patient.name}</h1>
          <RiskBadge risk={visit.risk} />
          <span className="rounded-full bg-marinho-800 px-2 py-0.5 text-xs text-white">{statusLabel[visit.status]}</span>
        </div>
        <p className="text-sm text-slate-500">
          {years !== null && `${years} anos · `}chegou {formatDateTime(visit.arrivedAt)}
          {open && ` (há ${waitLabel(minutesBetween(visit.arrivedAt))})`}
          {visit.arrivalMode && ` · ${visit.arrivalMode}`}
        </p>
      </div>

      {jaChamado && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Outro profissional chamou este paciente agora há pouco.</p>}

      <section className="card grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase text-slate-500">Motivo da procura</p>
          <p>{visit.complaint}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Acompanhante</p>
          <p>{visit.companion ?? "Sem acompanhante informado"}</p>
          <p className="mt-1 text-xs text-slate-500">Chegada registrada por {displayName(visit.registeredBy)}</p>
        </div>
        {nurse && visit.patient.allergies && (
          <div className="sm:col-span-2">
            <p className="text-xs uppercase text-red-700">Alergias</p>
            <p className="font-medium text-red-800">{visit.patient.allergies}</p>
          </div>
        )}
        {nurse && visit.triagedAt && (
          <div className="sm:col-span-2 border-t border-slate-100 pt-3">
            <p className="text-xs uppercase text-slate-500">Triagem · {formatDateTime(visit.triagedAt)}{visit.triagedBy && ` · ${displayName(visit.triagedBy)}`}</p>
            <p>{[vitalsSummary(v), visit.pain !== null ? `Dor ${visit.pain}/10` : ""].filter(Boolean).join(" · ") || "Sem sinais vitais"}</p>
            {visit.triageNote && <p className="text-slate-600">{visit.triageNote}</p>}
          </div>
        )}
        {visit.doctor && (
          <div className="sm:col-span-2 border-t border-slate-100 pt-3">
            <p className="text-xs uppercase text-slate-500">Atendimento</p>
            <p>
              {displayName(visit.doctor)}{visit.calledAt && `, chamado às ${formatDateTime(visit.calledAt)}`}
              {visit.encounter && canOpenEncounter(user, visit.encounter) && (
                <>
                  {" · "}
                  <Link href={`/pacientes/${visit.patient.id}/atendimentos/${visit.encounter.id}`} className="text-marinho-700 hover:underline">
                    {visit.encounter.status === "FINALIZADO" ? "Ver atendimento" : "Abrir atendimento"}
                  </Link>
                </>
              )}
            </p>
          </div>
        )}
        {visit.closedAt && visit.outcome && (
          <div className="sm:col-span-2 border-t border-slate-100 pt-3">
            <p className="text-xs uppercase text-slate-500">Desfecho</p>
            <p className="font-medium">{outcomeLabel[visit.outcome]} · {formatDateTime(visit.closedAt)}{visit.closedBy && ` · ${displayName(visit.closedBy)}`}</p>
            {visit.closeNote && <p className="text-slate-600">{visit.closeNote}</p>}
          </div>
        )}
      </section>

      {open && nurse && waitingDoctor && (
        <ActionForm action={triageVisit.bind(null, visit.id)} submitLabel={visit.triagedAt ? "Refazer triagem" : "Concluir triagem"} resetOnSuccess={false}>
          <h2 className="font-semibold text-marinho-800">{visit.triagedAt ? "Refazer a triagem" : "Triagem"}</h2>
          <fieldset className="space-y-2">
            <legend className="label">Classificação de risco *</legend>
            <div className="grid gap-2 sm:grid-cols-5">
              {RISKS.map((r) => (
                <label key={r.key} className="flex cursor-pointer flex-col gap-1 rounded-md border border-slate-200 p-2 text-xs has-[:checked]:ring-2 has-[:checked]:ring-marinho-700">
                  <span className="flex items-center gap-2">
                    <input type="radio" name="risk" value={r.key} defaultChecked={visit.risk === r.key} required />
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${r.className}`}>{r.label}</span>
                  </span>
                  <span className="text-slate-600">{r.meaning}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {triageFields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`vital_${f.key}`}>
                  {f.short} <span className="text-slate-400">({f.unit})</span>
                </label>
                <input className="input" id={`vital_${f.key}`} name={`vital_${f.key}`} inputMode="decimal" defaultValue={v?.[f.key]?.toString() ?? ""} />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="pain">Dor <span className="text-slate-400">(0 a 10)</span></label>
              <input className="input" id="pain" name="pain" type="number" min={0} max={10} defaultValue={visit.pain ?? ""} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="triageNote">Discriminador e observações</label>
            <textarea className="input" id="triageNote" name="triageNote" rows={2} defaultValue={visit.triageNote ?? ""} placeholder="Ex.: dor torácica típica, sudorese; sem alergias conhecidas" />
          </div>
        </ActionForm>
      )}

      {open && doctor && waitingDoctor && (
        <form action={callPatient.bind(null, visit.id)} className="card flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <label className="label" htmlFor="templateId">Modelo do atendimento</label>
            <select className="input" id="templateId" name="templateId" defaultValue="">
              <option value="">Evolução livre</option>
              {templates.mine.length > 0 && <optgroup label="Meus modelos">{templates.mine.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>}
              {templates.clinic.length > 0 && <optgroup label="Modelos da instituição">{templates.clinic.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>}
            </select>
          </div>
          <button className="btn-primary">Chamar e começar o atendimento</button>
          {!visit.triagedAt && <p className="w-full text-xs text-amber-700">Paciente ainda sem triagem. Chame direto só em caso de emergência.</p>}
        </form>
      )}

      {open && (
        <ActionForm action={closeVisit.bind(null, visit.id)} submitLabel="Registrar" resetOnSuccess={false}>
          <h2 className="font-semibold text-marinho-800">Desfecho</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="outcome">O que aconteceu</label>
              <select className="input" id="outcome" name="outcome" defaultValue="" required>
                <option value="" disabled>Escolha</option>
                {doctor && visit.status !== "OBSERVACAO" && <option value="OBSERVACAO">Fica em observação</option>}
                {(Object.keys(outcomeLabel) as (keyof typeof outcomeLabel)[])
                  .filter((k) => doctor || k === "EVASAO")
                  .map((k) => <option key={k} value={k}>{outcomeLabel[k]}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="closeNote">Observação</label>
              <input className="input" id="closeNote" name="closeNote" placeholder="Ex.: orientado a retornar se piorar" />
            </div>
          </div>
          {doctor ? (
            <p className="text-xs text-slate-500">Internação leva direto para a escolha do leito, com o paciente já preenchido.</p>
          ) : (
            <p className="text-xs text-slate-500">Alta, internação, transferência e óbito são registrados pelo médico. Aqui você registra só se o paciente foi embora sem alta.</p>
          )}
        </ActionForm>
      )}
    </div>
  );
}
