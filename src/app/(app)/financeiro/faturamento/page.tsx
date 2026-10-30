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

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) notFound();
  const range = monthRange((await searchParams).mes);
  const clinicId = user.clinicId;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);

  const [claims, toBill] = await Promise.all([
    prisma.insuranceClaim.findMany({
      where: { clinicId, serviceDate: { gte: range.start, lt: range.end } },
      include: { patient: { select: { name: true } }, healthPlan: { select: { name: true } }, professional: { select: { name: true, jobTitle: true, sex: true } } },
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
  ]);

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
                  {c.status === "ABERTA" ? (
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
