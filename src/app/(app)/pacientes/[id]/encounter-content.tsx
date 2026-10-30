import { formatDateTime } from "@/lib/format";
import { highlight } from "@/lib/history";
import type { Diagnosis, TemplateField } from "@/lib/record";
import { displayName, councilLabel } from "@/lib/staff";

type Author = { name: string; jobTitle: string | null; sex: string | null; councilType: string | null; councilNumber: string | null; councilUf: string | null; rqe: string | null };

export function Marked({ text, term }: { text: string; term: string }) {
  return (
    <>
      {highlight(text, term).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded bg-dourado-300/70 px-0.5 text-inherit">{part.text}</mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

function council(a: Author) {
  const label = councilLabel(a);
  return label ? ` · ${label}` : "";
}

// Conteúdo completo de um atendimento (campos, diagnósticos e adendos),
// usado no histórico e na impressão do histórico.
export function EncounterContent({
  encounter,
  term = "",
}: {
  encounter: {
    fields: unknown;
    content: unknown;
    diagnoses: unknown;
    addenda: { id: string; text: string; createdAt: Date; author: Author }[];
  };
  term?: string;
}) {
  const fields = encounter.fields as TemplateField[];
  const content = encounter.content as Record<string, string>;
  const diagnoses = encounter.diagnoses as Diagnosis[];
  const filled = fields.filter((f) => content[f.key]);

  return (
    <div className="space-y-3">
      {filled.length === 0 && <p className="text-sm text-slate-400">Nenhum campo preenchido.</p>}
      {filled.map((f) => (
        <section key={f.key}>
          <h4 className="text-sm font-semibold text-slate-700">{f.label}</h4>
          <p className="whitespace-pre-wrap text-sm"><Marked text={content[f.key]} term={term} /></p>
        </section>
      ))}
      {diagnoses.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-slate-700">Diagnósticos (CID-10)</h4>
          <ul className="text-sm">
            {diagnoses.map((d) => (
              <li key={d.code}><strong>{d.code}</strong> <Marked text={d.description} term={term} /></li>
            ))}
          </ul>
        </section>
      )}
      {encounter.addenda.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700">Adendos</h4>
          {encounter.addenda.map((a) => (
            <div key={a.id} className="border-l-2 border-dourado-500 pl-3">
              <p className="text-xs text-slate-500">{formatDateTime(a.createdAt)} · {displayName(a.author)}{council(a.author)}</p>
              <p className="whitespace-pre-wrap text-sm"><Marked text={a.text} term={term} /></p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
