import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageCharges, canManageFinance } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { monthRange, paymentMethodLabel, today } from "@/lib/finance";
import { MonthNav, SummaryCard } from "./ui";

function Bars({ rows }: { rows: { label: string; cents: number }[] }) {
  const max = Math.max(...rows.map((r) => r.cents), 1);
  if (rows.length === 0) return <p className="text-sm text-slate-400">Nada neste mês.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">{r.label}</span>
            <span className="font-medium">{formatMoney(r.cents)}</span>
          </div>
          <div className="mt-1 h-2 rounded bg-slate-100">
            <div className="h-2 rounded bg-dourado-400" style={{ width: `${(r.cents / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function FinanceSummaryPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) redirect(canManageCharges(user) ? "/financeiro/receitas" : "/financeiro/repasse");
  const { mes } = await searchParams;
  const range = monthRange(mes);
  const clinicId = user.clinicId;
  const inMonth = { gte: range.start, lt: range.end };

  const [received, spent, toReceive, toPay, byMethod, byCategory, overdue, overdueTotal] = await Promise.all([
    prisma.charge.aggregate({ where: { clinicId, status: "PAGO", paidAt: inMonth }, _sum: { amountCents: true } }),
    prisma.expense.aggregate({ where: { clinicId, status: "PAGO", paidAt: inMonth }, _sum: { amountCents: true } }),
    prisma.charge.aggregate({ where: { clinicId, status: "PENDENTE", dueDate: inMonth }, _sum: { amountCents: true } }),
    prisma.expense.aggregate({ where: { clinicId, status: "PENDENTE", dueDate: inMonth }, _sum: { amountCents: true } }),
    prisma.charge.groupBy({ by: ["paymentMethod"], where: { clinicId, status: "PAGO", paidAt: inMonth }, _sum: { amountCents: true } }),
    prisma.expense.groupBy({ by: ["category"], where: { clinicId, status: "PAGO", paidAt: inMonth }, _sum: { amountCents: true } }),
    prisma.charge.findMany({
      where: { clinicId, status: "PENDENTE", dueDate: { lt: today() } },
      include: { patient: true },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    prisma.charge.aggregate({ where: { clinicId, status: "PENDENTE", dueDate: { lt: today() } }, _sum: { amountCents: true }, _count: true }),
  ]);

  const inCents = received._sum.amountCents ?? 0;
  const outCents = spent._sum.amountCents ?? 0;
  const balance = inCents - outCents;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav basePath="/financeiro" range={range} />
        <div className="flex gap-2">
          <Link href="/financeiro/receitas/nova" className="btn-primary">+ Nova cobrança</Link>
          <Link href="/financeiro/despesas" className="btn-secondary">+ Nova despesa</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Entrou" value={formatMoney(inCents)} tone="green" hint="Pagamentos recebidos no mês" />
        <SummaryCard label="Saiu" value={formatMoney(outCents)} tone="red" hint="Despesas pagas no mês" />
        <SummaryCard label="Saldo" value={formatMoney(balance)} tone={balance < 0 ? "red" : "default"} hint="Entrou menos saiu" />
        <SummaryCard
          label="Falta receber"
          value={formatMoney(toReceive._sum.amountCents ?? 0)}
          tone="gold"
          hint={`Cobranças vencendo no mês · a pagar: ${formatMoney(toPay._sum.amountCents ?? 0)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-semibold">Recebido por forma de pagamento</h2>
          <Bars
            rows={byMethod
              .map((r) => ({ label: r.paymentMethod ? paymentMethodLabel[r.paymentMethod] : "Outro", cents: r._sum.amountCents ?? 0 }))
              .sort((a, b) => b.cents - a.cents)}
          />
        </div>
        <div className="card space-y-3">
          <h2 className="font-semibold">Despesas por categoria</h2>
          <Bars rows={byCategory.map((r) => ({ label: r.category, cents: r._sum.amountCents ?? 0 })).sort((a, b) => b.cents - a.cents)} />
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Pagamentos atrasados</h2>
          {overdueTotal._count > 0 && (
            <span className="text-sm text-red-700">
              {overdueTotal._count} cobrança{overdueTotal._count > 1 ? "s" : ""} · {formatMoney(overdueTotal._sum.amountCents ?? 0)}
            </span>
          )}
        </div>
        {overdue.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum pagamento atrasado.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {overdue.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{c.patient.name}</span>
                  <span className="text-slate-500"> · {c.description} · venceu em {formatDate(c.dueDate)}</span>
                </span>
                <span className="font-medium text-red-700">{formatMoney(c.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/financeiro/receitas?situacao=atrasado" className="text-sm text-marinho-700 hover:underline">Ver todas as receitas →</Link>
      </div>
    </div>
  );
}
