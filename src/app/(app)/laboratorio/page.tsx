import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canReleaseLabResult } from "@/lib/hospital-roles";
import { canWorkClinical } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { asFields, referenceLabel } from "@/lib/exames";
import { kitchenDate as todayDate } from "@/lib/cozinha";
import { ActionForm } from "../financeiro/action-form";
import { cancelExam, collectExam, saveLabResult } from "../exames/actions";
import { ExamHeader } from "../exames/exam-header";
import { loadQueue, queueWards } from "../exames/queue-data";
import { QueueFilter, QueueMore } from "../exames/queue-filter";
import { ResultView } from "../exames/result-view";
import { RecordActions } from "../assinatura/record-actions";

// Laboratório: coletar, liberar resultado e ver o que saiu nas últimas 24 horas.
export default async function LabPage({ searchParams }: { searchParams: Promise<{ ala?: string }> }) {
  const user = await requireUser("laboratorio");
  const tomorrow = new Date(todayDate().getTime() + 27 * 3600_000);
  const { ala = "" } = await searchParams;
  const [{ toCollect, toRelease, released, counts }, wards] = await Promise.all([loadQueue(user.clinicId, "LABORATORIO", tomorrow, ala), queueWards(user.clinicId)]);
  const team = canWorkClinical(user);
  const releaser = canReleaseLabResult(user);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Laboratório</h1>
          <p className="text-sm text-slate-500">Urgentes primeiro. Valores fora da referência aparecem em vermelho para quem pediu.</p>
        </div>
        <Link href="/laboratorio/catalogo" className="btn-secondary">Catálogo de exames</Link>
      </div>

      <QueueFilter path="/laboratorio" ala={ala} wards={wards} />

      <section className="space-y-2">
        <h2 className="font-semibold text-marinho-800">A coletar ({counts.toCollect})</h2>
        {toCollect.length === 0 && <p className="card text-sm text-slate-500">Nenhuma coleta pendente.</p>}
        <ul className="space-y-2">
          {toCollect.map((e) => (
            <li key={e.id} className="card space-y-2 text-sm">
              <ExamHeader e={e} />
              {e.examType.sample && <p className="text-xs text-slate-500">Amostra: {e.examType.sample}</p>}
              <div className="flex flex-wrap items-end gap-3">
                {team && <ActionForm action={collectExam.bind(null, e.id)} submitLabel="Coletado" className="flex">{null}</ActionForm>}
                <details className="text-xs">
                  <summary className="cursor-pointer text-marinho-700">Cancelar</summary>
                  <ActionForm action={cancelExam.bind(null, e.id)} submitLabel="Cancelar exame" className="mt-1 flex flex-wrap items-end gap-2">
                    <input name="reason" className="input w-auto! min-w-48" placeholder="Motivo" aria-label="Motivo do cancelamento" />
                  </ActionForm>
                </details>
              </div>
            </li>
          ))}
        </ul>
        <QueueMore shown={toCollect.length} total={counts.toCollect} />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-marinho-800">Em análise ({counts.toRelease})</h2>
        {toRelease.length === 0 && <p className="card text-sm text-slate-500">Nada em análise.</p>}
        <ul className="space-y-2">
          {toRelease.map((e) => {
            const fields = asFields(e.examType.fields);
            return (
              <li key={e.id} className="card space-y-2 text-sm">
                <ExamHeader e={e} />
                <p className="text-xs text-slate-500">Coletado em {formatDateTime(e.collectedAt)}</p>
                {releaser ? (
                  <ActionForm action={saveLabResult.bind(null, e.id)} submitLabel="Liberar resultado" className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {fields.map((f, i) => (
                        <label key={f.name} className="flex items-center gap-2">
                          <span className="w-40 shrink-0">{f.name}</span>
                          <input name={`v${i}`} className="input w-28!" aria-label={f.name} />
                          <span className="text-xs text-slate-500">{f.unit} {referenceLabel(f) && `(${referenceLabel(f)})`}</span>
                        </label>
                      ))}
                    </div>
                    <input name="report" className="input" placeholder="Observação (opcional)" aria-label="Observação" />
                    <input name="criticalNote" className="input" placeholder="Valor crítico? A quem foi avisado e quando" aria-label="Valor crítico" />
                  </ActionForm>
                ) : (
                  <p className="text-xs text-slate-500">A liberação é feita por profissional com conselho.</p>
                )}
              </li>
            );
          })}
        </ul>
        <QueueMore shown={toRelease.length} total={counts.toRelease} />
      </section>

      {released.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-marinho-800">Liberados nas últimas 24 horas{counts.released > released.length && ` (os ${released.length} mais recentes de ${counts.released})`}</h2>
          <ul className="space-y-2">
            {released.map((e) => (
              <li key={e.id} className="card space-y-2 text-sm">
                <ExamHeader e={e} />
                <ResultView exam={e} />
                <RecordActions user={user} type="exame" recordKey={e.id} signLabel="Assinar resultado" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
