import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { loadResultLabel, methodLabel, packageState, packageStateLabel } from "@/lib/cme";
import { ActionForm } from "../../../financeiro/action-form";
import { recallLoad } from "../../actions";

const people = { select: { name: true, sex: true, jobTitle: true } };

// Uma carga: indicadores, pacotes e em quais cirurgias (e pacientes) cada pacote foi usado.
export default async function LoadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("cme");
  const { id } = await params;
  const load = await prisma.sterilizationLoad.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      operator: people,
      resultBy: people,
      packages: {
        include: {
          kit: { select: { name: true } },
          surgery: { select: { id: true, procedure: true, scheduledAt: true, patient: { select: { name: true, socialName: true } } } },
        },
        orderBy: { kitId: "asc" },
      },
    },
  });
  if (!load) notFound();
  const used = load.packages.filter((p) => p.surgery);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/cme" className="text-sm text-marinho-700 hover:underline">← CME</Link>
        <h1 className="mt-1 text-2xl font-semibold">Carga {load.code}</h1>
        <p className="text-sm text-slate-500">{methodLabel[load.method]} · {load.equipment} · {formatDateTime(load.startedAt)} · {displayName(load.operator)}</p>
      </div>
      <section className="card space-y-1 text-sm">
        <p><strong>{loadResultLabel[load.result]}</strong>{load.resultAt && ` em ${formatDateTime(load.resultAt)}`}{load.resultBy && ` por ${displayName(load.resultBy)}`}</p>
        {load.result !== "PENDENTE" && <p>Indicador químico: {load.chemicalOk ? "aprovado" : "não aprovado"} · Indicador biológico: {load.biologicalOk ? "negativo" : "não aprovado"}</p>}
        {load.resultNote && <p className="text-slate-600">{load.resultNote}</p>}
      </section>

      {load.result === "RECOLHIDA" && used.length > 0 && (
        <section className="card space-y-2 border-red-300">
          <h2 className="font-semibold text-red-800">Pacientes expostos ({used.length})</h2>
          <p className="text-sm text-slate-600">Pacotes desta carga já usados em cirurgias. Avise a CCIH para acompanhar esses pacientes.</p>
        </section>
      )}

      <section className="card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Kit</th><th className="px-3 py-2">Validade</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Usado em</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {load.packages.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">{p.kit.name}</td>
                <td className="px-3 py-2">{formatDate(p.expiresAt)}</td>
                <td className="px-3 py-2">{packageStateLabel[packageState(p, load)]}{p.discardReason && ` (${p.discardReason})`}</td>
                <td className="px-3 py-2">
                  {p.surgery ? (
                    <Link href={`/centro-cirurgico/${p.surgery.id}`} className="text-marinho-700 hover:underline">
                      {p.surgery.patient.socialName || p.surgery.patient.name} · {p.surgery.procedure} · {formatDate(p.surgery.scheduledAt)}
                    </Link>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {load.result === "LIBERADA" && (
        <ActionForm action={recallLoad.bind(null, load.id)} submitLabel="Recolher carga" className="card flex flex-wrap items-end gap-2">
          <div className="grow">
            <label className="label" htmlFor="note">Recolher a carga (bloqueia os pacotes que sobraram e lista quem usou)</label>
            <input className="input" id="note" name="note" placeholder="Ex.: indicador biológico positivo na leitura de 48h" />
          </div>
        </ActionForm>
      )}
    </div>
  );
}
