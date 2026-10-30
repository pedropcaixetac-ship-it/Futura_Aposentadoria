import { formatDateTime } from "@/lib/format";
import { vitalsSummary, type Vitals } from "@/lib/vitals";
import type { Diagnosis, TemplateField } from "@/lib/record";

export type HistoryEncounter = {
  id: string;
  startedAt: Date;
  templateName: string | null;
  professionalName: string;
  fields: TemplateField[];
  content: Record<string, string>;
  diagnoses: Diagnosis[];
  vitals: Vitals | null;
};

type Props = {
  summary: { currentMedications: string | null; personalHistory: string | null; familyHistory: string | null };
  encounters: HistoryEncounter[];
};

// Coluna lateral da consulta: resumo clínico e atendimentos anteriores, sem sair da tela.
export function PatientHistory({ summary, encounters }: Props) {
  const items = [
    { label: "Medicamentos em uso", value: summary.currentMedications },
    { label: "Antecedentes pessoais", value: summary.personalHistory },
    { label: "Antecedentes familiares", value: summary.familyHistory },
  ];

  return (
    <aside className="no-print space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <div className="card space-y-2">
        <h2 className="font-semibold">Resumo clínico</h2>
        {items.map((i) => (
          <div key={i.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{i.label}</p>
            <p className="whitespace-pre-wrap text-sm">{i.value || <span className="text-slate-400">Não informado</span>}</p>
          </div>
        ))}
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">Atendimentos anteriores</h2>
        {encounters.length === 0 && <p className="text-sm text-slate-400">Primeiro atendimento deste paciente.</p>}
        {encounters.map((e) => {
          const vitals = vitalsSummary(e.vitals);
          return (
            <details key={e.id} className="group rounded-md border border-slate-200 open:border-dourado-400">
              <summary className="cursor-pointer list-none px-3 py-2 hover:bg-marinho-50">
                <span className="block text-sm font-medium">{formatDateTime(e.startedAt)}</span>
                <span className="block text-xs text-slate-500">
                  {e.templateName ?? "Evolução livre"} · {e.professionalName}
                </span>
                {e.diagnoses.length > 0 && (
                  <span className="mt-0.5 block text-xs text-marinho-700">{e.diagnoses.map((d) => d.code).join(", ")}</span>
                )}
              </summary>
              <div className="space-y-2 border-t border-slate-100 px-3 py-2 text-sm">
                {vitals && <p className="text-xs text-slate-600">{vitals}</p>}
                {e.fields.map((f) =>
                  e.content[f.key] ? (
                    <div key={f.key}>
                      <p className="text-xs font-semibold text-slate-600">{f.label}</p>
                      <p className="whitespace-pre-wrap">{e.content[f.key]}</p>
                    </div>
                  ) : null,
                )}
                {e.diagnoses.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600">Diagnósticos</p>
                    {e.diagnoses.map((d) => (
                      <p key={d.code}><strong>{d.code}</strong> {d.description}</p>
                    ))}
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </aside>
  );
}
