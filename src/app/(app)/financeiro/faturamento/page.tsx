import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { monthRange } from "@/lib/finance";
import { displayName } from "@/lib/staff";
import { claimNumberLabel } from "@/lib/tiss";
import { MonthNav } from "../ui";
import { closeBatch } from "./actions";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) notFound();
  const range = monthRange((await searchParams).mes);
  const clinicId = user.clinicId;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);

  const [claims, toBill, toSend, batches] = await Promise.all([
    prisma.insuranceClaim.findMany({
      where: { clinicId, serviceDate: { gte: range.start, lt: range.end } },
      include: {
        patient: { select: { name: true } },
        healthPlan: { select: { name: true } },
        professional: { select: { name: true, jobTitle: true, sex: true } },
        batch: { select: { id: true, number: true } },
      },
      orderBy: [{ serviceDate: "asc" }, { number: "asc" }],
    }),
    prisma.encounter.findMany({
      where: {
        clinicId,
        status: "FINALIZADO",
        finalizedAt: { gte: ninetyDaysAgo },
        patient: { healthPlanId: { not: null } },
        claims: { none: { status: "ABERTA" } },
        charges: { none: { status: { not: "CANCELADO" } } },
      },
      select: {
        id: true,
        finalizedAt: true,
        patient: { select: { name: true, healthPlan: { select: { name: true } } } },
        professional: { select: { name: true, jobTitle: true, sex: true } },
      },
      orderBy: { finalizedAt: "desc" },
      take: 30,
    }),
    // Guias de qualquer mês que ainda não entraram em lote, somadas por convênio.
    prisma.insuranceClaim.groupBy({
      by: ["healthPlanId"],
      where: { clinicId, status: "ABERTA", batchId: null },
      _count: true,
      _sum: { amountCents: true },
    }),
    prisma.claimBatch.findMany({
      where: { clinicId },
      include: { healthPlan: { select: { name: true } }, _count: { select: { claims: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  const planNames = new Map(
    (await prisma.healthPlan.findMany({ where: { clinicId, id: { in: toSend.map((t) => t.healthPlanId) } }, select: { id: true, name: true } }))
      .map((p) => [p.id, p.name]),
  );

  const openClaims = claims.filter((c) => c.status === "ABERTA");
  const total = openClaims.reduce((t, c) => t + c.amountCents, 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Faturamento de convênios</h2>
        <p className="text-sm text-slate-500">Guias de consulta no padrão TISS, geradas a partir dos atendimentos finalizados.</p>
      </div>

      {toBill.length > 0 && (
        <div className="card space-y-3 border-dourado-300 bg-dourado-100/40">
          <h3 className="font-semibold">Atendimentos de convênio sem guia</h3>
          <ul className="divide-y divide-dourado-300/50 text-sm">
            {toBill.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{e.patient.name}</span>
                  <span className="text-slate-500"> · {e.patient.healthPlan?.name} · {displayName(e.professional)} · {formatDateTime(e.finalizedAt)}</span>
                </span>
                <Link href={`/financeiro/faturamento/nova?atendimento=${e.id}`} className="btn-primary px-3! py-1! text-xs!">
                  Gerar guia
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {toSend.length > 0 && (
        <div className="card space-y-3">
          <h3 className="font-semibold">Guias a enviar</h3>
          <p className="text-sm text-slate-500">Feche um lote por convênio para gerar o arquivo XML que vai no portal do convênio (até 100 guias por lote).</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {toSend.map((t) => (
              <li key={t.healthPlanId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{planNames.get(t.healthPlanId)}</span>
                  <span className="text-slate-500"> · {t._count} guia(s) · {formatMoney(t._sum.amountCents ?? 0)}</span>
                </span>
                <form action={closeBatch.bind(null, t.healthPlanId)}>
                  <button className="btn-primary px-3! py-1! text-xs!">Fechar lote</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {batches.length > 0 && (
        <div className="card space-y-2">
          <h3 className="font-semibold">Lotes recentes</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/financeiro/faturamento/lotes/${b.id}`} className="text-marinho-700 hover:underline">
                  Lote nº {b.number} · {b.healthPlan.name}
                </Link>
                <span className="text-slate-500">{b._count.claims} guia(s) · {formatDateTime(b.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav basePath="/financeiro/faturamento" range={range} />
        <p className="text-sm text-slate-600">
          {openClaims.length} guia(s) · <span className="font-semibold text-marinho-800">{formatMoney(total)}</span>
        </p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Guia</th>
              <th className="px-4 py-2 font-medium">Data</th>
              <th className="px-4 py-2 font-medium">Paciente</th>
              <th className="px-4 py-2 font-medium">Convênio</th>
              <th className="px-4 py-2 font-medium">Profissional</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {claims.map((c) => (
              <tr key={c.id} className={c.status === "CANCELADA" ? "text-slate-400" : ""}>
                <td className="px-4 py-2">
                  <Link href={`/financeiro/faturamento/${c.id}`} className="font-mono text-marinho-700 hover:underline">{claimNumberLabel(c.number)}</Link>
                </td>
                <td className="px-4 py-2">{formatDate(c.serviceDate)}</td>
                <td className="px-4 py-2">{c.patient.name}</td>
                <td className="px-4 py-2">{c.healthPlan.name}</td>
                <td className="px-4 py-2">{displayName(c.professional)}</td>
                <td className="px-4 py-2 text-right">{formatMoney(c.amountCents)}</td>
                <td className="px-4 py-2">
                  {c.batch ? (
                    <Link href={`/financeiro/faturamento/lotes/${c.batch.id}`} className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                      Lote nº {c.batch.number}
                    </Link>
                  ) : c.status === "ABERTA" ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">A enviar</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Cancelada</span>
                  )}
                </td>
              </tr>
            ))}
            {claims.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Nenhuma guia neste mês.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
