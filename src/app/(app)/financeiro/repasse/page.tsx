import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { commission, commissionDescription, monthRange } from "@/lib/finance";
import { launchCommissionExpense, updateCommission } from "../actions";
import { MonthNav } from "../ui";
import { displayName } from "@/lib/staff";

export default async function CommissionPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser("financeiro");
  const admin = canManageFinance(user);
  const { mes } = await searchParams;
  const range = monthRange(mes);
  const paidInMonth = { clinicId: user.clinicId, status: "PAGO" as const, paidAt: { gte: range.start, lt: range.end } };

  // Aqui o administrativo vê o repasse de todos; o profissional vê o próprio em "Meu financeiro".
  if (!admin) notFound();

  const [professionals, totals, launched] = await Promise.all([
    prisma.user.findMany({
      where: { clinicId: user.clinicId, active: true, OR: [{ role: { in: ["PROFISSIONAL", "TECNICO"] } }, { councilNumber: { not: null } }] },
      orderBy: { name: "asc" },
    }),
    prisma.charge.groupBy({ by: ["professionalId"], where: paidInMonth, _sum: { amountCents: true }, _count: true }),
    prisma.expense.findMany({
      where: { clinicId: user.clinicId, category: "Repasse a profissionais", status: { not: "CANCELADO" } },
      select: { description: true },
    }),
  ]);
  const launchedDescriptions = new Set(launched.map((e) => e.description));
  const byProfessional = new Map(totals.map((t) => [t.professionalId, t]));
  const rows = professionals.map((p) => {
    const received = byProfessional.get(p.id)?._sum.amountCents ?? 0;
    return {
      ...p,
      count: byProfessional.get(p.id)?._count ?? 0,
      received,
      value: commission(received, p.commissionPercent),
      launched: launchedDescriptions.has(commissionDescription(p.name, range.label)),
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav basePath="/financeiro/repasse" range={range} />
        <p className="text-sm text-slate-500">Calculado sobre o que foi recebido no mês.</p>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Profissional</th>
              <th className="px-4 py-2 text-right font-medium">Pagamentos</th>
              <th className="px-4 py-2 text-right font-medium">Recebido</th>
              <th className="px-4 py-2 font-medium">Porcentagem do profissional</th>
              <th className="px-4 py-2 text-right font-medium">Repasse</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <span className="font-medium">{displayName(p)}</span>
                  {p.specialty && <span className="block text-xs text-slate-500">{p.specialty}</span>}
                </td>
                <td className="px-4 py-2 text-right">{p.count}</td>
                <td className="px-4 py-2 text-right">{formatMoney(p.received)}</td>
                <td className="px-4 py-2">
                  <form action={updateCommission.bind(null, p.id)} className="flex items-center gap-1">
                    <input
                      name="percent"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={p.commissionPercent ?? ""}
                      className="input w-20!"
                      aria-label={`Porcentagem de ${displayName(p)}`}
                    />
                    <span>%</span>
                    <button className="ml-1 text-xs text-marinho-700 hover:underline">Salvar</button>
                  </form>
                </td>
                <td className="px-4 py-2 text-right font-semibold text-dourado-700">{formatMoney(p.value)}</td>
                <td className="px-4 py-2 text-right">
                  {p.launched && <span className="text-xs text-emerald-700">Lançado nas despesas ✓</span>}
                  {p.value > 0 && !p.launched && (
                    <form action={launchCommissionExpense.bind(null, p.id, range.month)}>
                      <button className="text-xs text-marinho-700 hover:underline">Lançar como despesa</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50">
            <tr>
              <td colSpan={2} className="px-4 py-2 font-medium">Total</td>
              <td className="px-4 py-2 text-right font-medium">{formatMoney(rows.reduce((t, r) => t + r.received, 0))}</td>
              <td />
              <td className="px-4 py-2 text-right font-semibold text-dourado-700">{formatMoney(rows.reduce((t, r) => t + r.value, 0))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
