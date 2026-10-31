import Link from "next/link";
import type { MealKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { age, formatDate, formatDateTime } from "@/lib/format";
import { compareBedCodes } from "@/lib/internacao";
import { isolationLabel, isolationStyle } from "@/lib/ccih";
import { currentMeal, isEnteral, isFasting, kitchenDate, MEALS, mealStatusLabel, productionCount } from "@/lib/cozinha";
import { cancelMeal, recordMeal } from "./actions";
import { MealForm } from "./meal-form";
import { PrintButton } from "../pacientes/[id]/atendimentos/[encounterId]/print-button";

const statusTone = { ENTREGUE: "text-emerald-700", RECUSOU: "text-amber-700", NAO_SERVIDO: "text-slate-600" };

// Cozinha: mapa de dietas dos internados (pelo que o médico prescreveu) e a entrega de cada refeição.
export default async function KitchenPage({ searchParams }: { searchParams: Promise<{ refeicao?: string }> }) {
  const user = await requireUser("cozinha");
  const { refeicao } = await searchParams;
  const meal: MealKind = MEALS.find((m) => m.kind === refeicao)?.kind ?? currentMeal();
  const today = kitchenDate();
  const now = new Date();

  const admissions = await prisma.admission.findMany({
    where: { clinicId: user.clinicId, dischargedAt: null },
    include: {
      patient: { select: { name: true, socialName: true, birthDate: true, allergies: true } },
      bed: { select: { code: true, ward: { select: { name: true } } } },
      prescriptionItems: {
        where: { kind: "DIETA", suspendedAt: null, startAt: { lte: now }, OR: [{ endAt: null }, { endAt: { gt: now } }] },
        select: { description: true, note: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      isolations: { where: { endedAt: null }, select: { kind: true } },
      meals: {
        where: { date: today, meal, canceledAt: null },
        include: { recordedBy: { select: { name: true } } },
      },
    },
  });
  const rows = admissions
    .map((a) => ({ ...a, prescriptions: a.prescriptionItems, diets: a.prescriptionItems.map((p) => p.description) }))
    .sort((a, b) => a.bed.ward.name.localeCompare(b.bed.ward.name) || compareBedCodes(a.bed.code, b.bed.code));
  const production = productionCount(rows);
  const wards = [...new Set(rows.map((r) => r.bed.ward.name))];
  const delivered = rows.filter((r) => r.meals.length > 0).length;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cozinha</h1>
          <p className="text-sm text-slate-500">Mapa de dietas de {formatDate(today)}. A dieta vem da prescrição do médico; alergias e isolamentos aparecem em cada leito.</p>
        </div>
        <PrintButton />
      </div>

      <nav className="no-print flex flex-wrap gap-1 border-b border-slate-200 text-sm">
        {MEALS.map((m) => (
          <Link
            key={m.kind}
            href={`/cozinha?refeicao=${m.kind}`}
            className={`-mb-px border-b-2 px-3 py-2 ${m.kind === meal ? "border-dourado-500 font-medium text-marinho-800" : "border-transparent text-slate-500 hover:text-marinho-700"}`}
          >
            {m.label} <span className="text-xs text-slate-400">{String(m.hour).padStart(2, "0")}:{String(m.minute).padStart(2, "0")}</span>
          </Link>
        ))}
      </nav>

      <section className="card space-y-2">
        <h2 className="font-semibold text-marinho-800">Produção ({rows.length} internados · {delivered} já marcados nesta refeição)</h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {production.diets.map(([diet, n]) => (
            <li key={diet}><strong>{n}×</strong> {diet}</li>
          ))}
          {production.fasting > 0 && <li className="text-red-700"><strong>{production.fasting}×</strong> em jejum (não servir)</li>}
          {production.none > 0 && <li className="text-amber-700"><strong>{production.none}×</strong> sem dieta prescrita (confirmar com a enfermagem)</li>}
        </ul>
      </section>

      {rows.length === 0 && <p className="card text-sm text-slate-500">Nenhum paciente internado.</p>}
      {wards.map((ward) => (
        <section key={ward} className="space-y-2">
          <h2 className="font-semibold text-marinho-800">{ward}</h2>
          <div className="card overflow-x-auto p-0!">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Leito</th>
                  <th className="px-3 py-2">Paciente</th>
                  <th className="px-3 py-2">Dieta</th>
                  <th className="px-3 py-2">Refeição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.filter((r) => r.bed.ward.name === ward).map((r) => {
                  const years = age(r.patient.birthDate);
                  const fasting = r.diets.some(isFasting);
                  const record = r.meals[0];
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-2 font-semibold">{r.bed.code}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{r.patient.socialName || r.patient.name}</p>
                        {years !== null && <p className="text-xs text-slate-500">{years} anos</p>}
                        {r.patient.allergies && <p className="mt-1 inline-block rounded bg-red-50 px-1.5 text-xs font-medium text-red-700">Alergias: {r.patient.allergies}</p>}
                        {r.isolations.map((i) => (
                          <p key={i.kind} className={`mt-1 inline-block rounded px-1.5 text-xs ${isolationStyle[i.kind]}`}>Isolamento: {isolationLabel[i.kind]} (bandeja descartável)</p>
                        ))}
                      </td>
                      <td className="px-3 py-2">
                        {r.prescriptions.length === 0 && <span className="text-amber-700">Sem dieta prescrita</span>}
                        {r.prescriptions.map((p, idx) => (
                          <p key={idx} className={isFasting(p.description) ? "font-semibold text-red-700" : ""}>
                            {p.description}
                            {isEnteral(p.description) && <span className="ml-1 rounded bg-slate-100 px-1 text-xs text-slate-600">não vai bandeja</span>}
                            {p.note && <span className="block text-xs text-slate-500">{p.note}</span>}
                          </p>
                        ))}
                      </td>
                      <td className="px-3 py-2">
                        {record ? (
                          <div className="text-xs">
                            <p className={`font-medium ${statusTone[record.status]}`}>{mealStatusLabel[record.status]}{record.note && `: ${record.note}`}</p>
                            <p className="text-slate-500">{record.recordedBy.name}, {formatDateTime(record.at)}</p>
                            <form action={cancelMeal.bind(null, record.id)} className="no-print">
                              <button className="text-marinho-700 hover:underline">Anular (marcado errado)</button>
                            </form>
                          </div>
                        ) : fasting ? (
                          <span className="text-xs font-semibold text-red-700">Jejum: não servir</span>
                        ) : (
                          <MealForm action={recordMeal.bind(null, r.id, meal)} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
