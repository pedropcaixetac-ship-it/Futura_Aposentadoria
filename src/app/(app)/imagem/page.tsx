import { requireUser } from "@/lib/auth";
import { canWorkClinical } from "@/lib/permissions";
import { isPhysician } from "@/lib/pronto-socorro";
import { formatDateTime } from "@/lib/format";
import { kitchenDate as todayDate } from "@/lib/cozinha";
import { ActionForm } from "../financeiro/action-form";
import { cancelExam, collectExam, saveImagingReport } from "../exames/actions";
import { ExamHeader } from "../exames/exam-header";
import { loadQueue } from "../exames/queue-data";
import { ResultView } from "../exames/result-view";

// Imagem: a agenda do dia por aparelho, o que falta laudar e os laudos das últimas 24 horas.
export default async function ImagingPage() {
  const user = await requireUser("imagem");
  const tomorrow = new Date(todayDate().getTime() + 27 * 3600_000);
  const { toCollect, toRelease, released } = await loadQueue(user.clinicId, "IMAGEM", tomorrow);
  const modalities = [...new Set(toCollect.map((e) => e.examType.modality ?? "Outros"))].sort();
  const team = canWorkClinical(user);
  const doctor = isPhysician(user);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Imagem</h1>
        <p className="text-sm text-slate-500">O técnico registra o exame feito; o médico faz o laudo, que aparece para quem pediu.</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-marinho-800">A realizar hoje ({toCollect.length})</h2>
        {toCollect.length === 0 && <p className="card text-sm text-slate-500">Nenhum exame para fazer.</p>}
        {modalities.map((m) => (
          <div key={m} className="space-y-2">
            <h3 className="text-sm font-medium text-slate-600">{m}</h3>
            <ul className="space-y-2">
              {toCollect.filter((e) => (e.examType.modality ?? "Outros") === m).map((e) => (
                <li key={e.id} className="card space-y-2 text-sm">
                  <ExamHeader e={e} />
                  {e.examType.preparation && <p className="text-xs text-slate-500">Preparo: {e.examType.preparation}</p>}
                  <div className="flex flex-wrap items-end gap-3">
                    {team && <ActionForm action={collectExam.bind(null, e.id)} submitLabel="Exame feito" className="flex">{null}</ActionForm>}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-marinho-700">Cancelar</summary>
                      <ActionForm action={cancelExam.bind(null, e.id)} submitLabel="Cancelar exame" className="mt-1 flex flex-wrap items-end gap-2">
                        <input name="reason" className="input w-auto! min-w-48" placeholder="Motivo (ex.: paciente faltou)" aria-label="Motivo do cancelamento" />
                      </ActionForm>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-marinho-800">A laudar ({toRelease.length})</h2>
        {toRelease.length === 0 && <p className="card text-sm text-slate-500">Nenhum exame esperando laudo.</p>}
        <ul className="space-y-2">
          {toRelease.map((e) => (
            <li key={e.id} className="card space-y-2 text-sm">
              <ExamHeader e={e} />
              <p className="text-xs text-slate-500">Feito em {formatDateTime(e.collectedAt)}</p>
              {doctor ? (
                <ActionForm action={saveImagingReport.bind(null, e.id)} submitLabel="Liberar laudo" className="space-y-2">
                  <textarea name="report" className="input min-h-28" placeholder="Técnica, achados e impressão diagnóstica" aria-label="Laudo" />
                  <input name="criticalNote" className="input" placeholder="Achado crítico? A quem foi avisado e quando" aria-label="Achado crítico" />
                </ActionForm>
              ) : (
                <p className="text-xs text-slate-500">O laudo é feito pelo médico.</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {released.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-marinho-800">Laudados nas últimas 24 horas</h2>
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
