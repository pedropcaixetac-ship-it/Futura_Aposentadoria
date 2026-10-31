import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { canAnswerConsult, canRequestConsult, canTakeOver, canTransferAttending, consultStatusLabel } from "@/lib/especialidades";
import { ActionForm } from "../../../financeiro/action-form";
import { answerConsult, cancelConsult, requestConsult, transferAttending } from "../../pareceres/actions";
import { loadSpecialists, loadSpecialties } from "../../pareceres/data";
import { CareHeader, CareNav } from "../care-nav";
import { loadAdmissionForCare } from "../care-data";

const person = { select: { name: true, sex: true, jobTitle: true } } as const;

// Especialidades da internação: quem é o responsável agora, transferências entre especialidades e pedidos de parecer.
export default async function AdmissionConsultsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("internacao");
  const { id } = await params;
  const admission = await loadAdmissionForCare(user, id);
  const [full, consults, changes, specialties, specialists] = await Promise.all([
    prisma.admission.findFirstOrThrow({ where: { id: admission.id, clinicId: user.clinicId }, select: { attendingId: true, specialty: true, attending: person } }),
    prisma.consultRequest.findMany({
      where: { clinicId: user.clinicId, admissionId: admission.id },
      include: { requestedBy: person, answeredBy: person, consultant: person, canceledBy: person },
      orderBy: { createdAt: "desc" },
    }),
    prisma.attendingChange.findMany({
      where: { clinicId: user.clinicId, admissionId: admission.id },
      include: { fromAttending: person, toAttending: person, changedBy: person },
      orderBy: { changedAt: "desc" },
    }),
    loadSpecialties(user.clinicId),
    loadSpecialists(user.clinicId),
  ]);
  const open = !admission.dischargedAt;
  const doctors = specialists.filter((s) => s.councilType === "CRM" && s.id !== full.attendingId);
  const bySpecialty = specialties.map((sp) => ({ sp, people: doctors.filter((d) => d.specialty?.trim() === sp) })).filter((g) => g.people.length);

  return (
    <div className="max-w-6xl space-y-6">
      <CareHeader admission={admission} />
      <CareNav admissionId={admission.id} current="pareceres" />

      <section className="card space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">Especialidade responsável</p>
        <p className="text-lg font-semibold text-marinho-800">{full.specialty ?? "Sem especialidade no cadastro do médico"}</p>
        <p className="text-sm">Médico responsável: {displayName(full.attending)}</p>
      </section>

      {open && (
        <div className="grid gap-4 md:grid-cols-2">
          {canRequestConsult(user) ? (
            <ActionForm action={requestConsult.bind(null, admission.id)} submitLabel="Pedir parecer">
              <h2 className="font-semibold text-marinho-800">Pedir parecer a outra especialidade</h2>
              <div>
                <label className="label" htmlFor="specialty">Especialidade</label>
                <select className="input" id="specialty" name="specialty" defaultValue="" required>
                  <option value="" disabled>Escolha</option>
                  {specialties.filter((s) => s !== full.specialty).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="consultantId">Profissional (opcional)</label>
                <select className="input" id="consultantId" name="consultantId" defaultValue="">
                  <option value="">Qualquer um da especialidade</option>
                  {specialties.map((sp) => (
                    <optgroup key={sp} label={sp}>
                      {specialists.filter((s) => s.specialty?.trim() === sp).map((s) => <option key={s.id} value={s.id}>{displayName(s)}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="question">Motivo do parecer</label>
                <textarea className="input min-h-24" id="question" name="question" required placeholder="Ex.: dor abdominal em piora, avaliar abdome agudo cirúrgico" />
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="urgent" /> Urgente</label>
            </ActionForm>
          ) : (
            <p className="card text-sm text-slate-500">O pedido de parecer é feito pelo médico (CRM).</p>
          )}

          {canTransferAttending(user) ? (
            <ActionForm action={transferAttending.bind(null, admission.id, full.attendingId)} submitLabel="Transferir paciente">
              <h2 className="font-semibold text-marinho-800">Transferir para outra especialidade</h2>
              <p className="text-sm text-slate-500">O médico escolhido passa a ser o responsável, e a especialidade dele passa a ser a da internação. O leito não muda (para isso, use &quot;Trocar de leito&quot;).</p>
              <div>
                <label className="label" htmlFor="toAttendingId">Novo médico responsável</label>
                <select className="input" id="toAttendingId" name="toAttendingId" defaultValue="" required>
                  <option value="" disabled>Escolha</option>
                  {bySpecialty.map((g) => (
                    <optgroup key={g.sp} label={g.sp}>
                      {g.people.map((d) => <option key={d.id} value={d.id}>{displayName(d)}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="reason">Motivo</label>
                <input className="input" id="reason" name="reason" required placeholder="Ex.: indicação cirúrgica, aceito pela cirurgia geral" />
              </div>
            </ActionForm>
          ) : (
            <p className="card text-sm text-slate-500">A transferência de especialidade é feita pelo médico (CRM).</p>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold text-marinho-800">Pareceres ({consults.length})</h2>
        {consults.length === 0 && <p className="card text-sm text-slate-500">Nenhum parecer pedido nesta internação.</p>}
        {consults.map((c) => (
          <article key={c.id} className={`card space-y-2 text-sm ${c.status === "PENDENTE" && c.urgent ? "border-red-300" : ""}`}>
            <p className="flex flex-wrap items-center gap-2">
              <strong>{c.specialty}</strong>
              {c.urgent && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">urgente</span>}
              <span className={`rounded px-1.5 py-0.5 text-xs ${c.status === "PENDENTE" ? "bg-amber-100 text-amber-800" : c.status === "RESPONDIDO" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{consultStatusLabel[c.status]}</span>
              <span className="text-slate-500">pedido por {displayName(c.requestedBy)} em {formatDateTime(c.createdAt)}{c.consultant && ` para ${displayName(c.consultant)}`}</span>
            </p>
            <p className="whitespace-pre-line">{c.question}</p>
            {c.status === "RESPONDIDO" && (
              <div className="rounded-md bg-emerald-50 p-2">
                <p className="text-xs text-emerald-800">Parecer de {c.answeredBy && displayName(c.answeredBy)} em {formatDateTime(c.answeredAt)}{c.tookOver && " · assumiu o paciente"}</p>
                <p className="whitespace-pre-line">{c.answer}</p>
              </div>
            )}
            {c.status === "CANCELADO" && <p className="text-xs text-slate-500">Cancelado por {c.canceledBy && displayName(c.canceledBy)}: {c.cancelReason}</p>}
            {c.status === "PENDENTE" && canAnswerConsult(user, c) && (
              <ActionForm action={answerConsult.bind(null, c.id)} submitLabel="Responder parecer" className="space-y-2 rounded-md bg-marinho-50 p-3">
                <textarea name="answer" className="input min-h-24" required placeholder="Avaliação, conduta sugerida e se a especialidade acompanha o caso" aria-label="Parecer" />
                {open && canTakeOver(user) && (
                  <label className="flex items-center gap-2"><input type="checkbox" name="takeOver" /> Assumir o paciente (ele passa para a {c.specialty}, comigo como responsável)</label>
                )}
              </ActionForm>
            )}
            {c.status === "PENDENTE" && (c.requestedById === user.id || canRequestConsult(user)) && (
              <details className="text-xs">
                <summary className="cursor-pointer text-marinho-700">Cancelar pedido</summary>
                <ActionForm action={cancelConsult.bind(null, c.id)} submitLabel="Cancelar pedido" className="mt-1 flex flex-wrap items-end gap-2">
                  <input name="reason" className="input w-auto! min-w-48" placeholder="Motivo" aria-label="Motivo do cancelamento" required />
                </ActionForm>
              </details>
            )}
          </article>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">Histórico de especialidades</h2>
        {changes.length === 0 ? (
          <p className="text-sm text-slate-500">O paciente está com a mesma equipe desde a internação.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {changes.map((m) => (
              <li key={m.id} className="py-2">
                <span className="font-medium">{formatDateTime(m.changedAt)}</span>{" "}
                {m.fromSpecialty ?? "?"} ({displayName(m.fromAttending)}) → {m.toSpecialty ?? "?"} ({displayName(m.toAttending)})
                <span className="text-slate-500"> · por {displayName(m.changedBy)}{m.reason && ` · ${m.reason}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
