import { bmi, bmiLabel, vitalFields, type Vitals } from "@/lib/vitals";

export function VitalsView({ vitals }: { vitals: Vitals | null }) {
  if (!vitals) return null;
  const imc = bmi(vitals);
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-700">Sinais vitais</h2>
      <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {vitals.pas !== undefined && vitals.pad !== undefined && (
          <div><dt className="inline text-slate-500">PA </dt><dd className="inline font-medium">{vitals.pas}x{vitals.pad} mmHg</dd></div>
        )}
        {vitalFields
          .filter((f) => vitals[f.key] !== undefined && !(vitals.pas !== undefined && vitals.pad !== undefined && (f.key === "pas" || f.key === "pad")))
          .map((f) => (
            <div key={f.key}>
              <dt className="inline text-slate-500">{f.short} </dt>
              <dd className="inline font-medium">{vitals[f.key]!.toLocaleString("pt-BR")} {f.unit}</dd>
            </div>
          ))}
        {imc && (
          <div><dt className="inline text-slate-500">IMC </dt><dd className="inline font-medium">{imc.toLocaleString("pt-BR")} ({bmiLabel(imc)})</dd></div>
        )}
      </dl>
    </section>
  );
}
