import { formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { asValues, flag, referenceLabel } from "@/lib/exames";

type Person = { name: string; sex: string | null; jobTitle: string | null } | null;

// Resultado liberado: valores com a referência (fora dela em vermelho) ou o laudo de imagem.
export function ResultView({ exam }: { exam: { values: unknown; report: string | null; criticalNote: string | null; resultAt: Date | null; resultBy: Person } }) {
  const values = asValues(exam.values);
  return (
    <div className="space-y-1 text-sm">
      {values.length > 0 && (
        <table className="w-full max-w-xl text-sm">
          <tbody className="divide-y divide-slate-100">
            {values.map((v) => {
              const f = flag(v);
              return (
                <tr key={v.name}>
                  <td className="py-0.5 pr-3">{v.name}</td>
                  <td className={`py-0.5 pr-3 font-medium ${f ? "text-red-700" : ""}`}>{v.value} {v.unit}{f && <span className="ml-1 text-xs">({f === "ALTO" ? "alto" : "baixo"})</span>}</td>
                  <td className="py-0.5 text-xs text-slate-500">{referenceLabel(v)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {exam.report && <p className="whitespace-pre-line">{exam.report}</p>}
      {exam.criticalNote && <p className="rounded bg-red-50 px-2 py-1 text-red-800">Valor crítico: {exam.criticalNote}</p>}
      {exam.resultAt && <p className="text-xs text-slate-500">Liberado por {exam.resultBy && displayName(exam.resultBy)} em {formatDateTime(exam.resultAt)}</p>}
    </div>
  );
}
