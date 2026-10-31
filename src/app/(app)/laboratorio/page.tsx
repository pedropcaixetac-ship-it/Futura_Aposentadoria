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
import { loadQueue } from "../exames/queue-data";
import { ResultView } from "../exames/result-view";

// Laboratório: coletar, liberar resultado e ver o que saiu nas últimas 24 horas.
export default async function LabPage() {
  const user = await requireUser("laboratorio");
  const tomorrow = new Date(todayDate().getTime() + 27 * 3600_000);
  const { toCollect, toRelease, released } = await loadQueue(user.clinicId, "LABORATORIO", tomorrow);
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

      <section className="space-y-2">
        <h2 className="font-semibold text-marinho-800">A coletar ({toCollect.length})</h2>
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
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-marinho-800">Em análise ({toRelease.length})</h2>
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
      </section>

      {released.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-marinho-800">Liberados nas últimas 24 horas</h2>
          <ul className="space-y-2">
            {released.map((e) => (
              <li key={e.id} className="card space-y-2 text-sm">
                <ExamHeader e={e} />
                <ResultView exam={e} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
