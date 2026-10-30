import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { monthRange } from "@/lib/finance";
import { formatCnpj } from "@/lib/purchase";
import { MonthNav, SummaryCard } from "../ui";

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ mes?: string; q?: string }> }) {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) notFound();
  const { mes, q = "" } = await searchParams;
  const range = monthRange(mes);
  const term = q.trim();
  const digits = term.replace(/\D/g, "");

  const purchases = await prisma.purchase.findMany({
    where: {
      clinicId: user.clinicId,
      issueDate: { gte: range.start, lt: range.end },
      ...(term && {
        OR: [
          { supplierName: { contains: term, mode: "insensitive" as const } },
          { items: { some: { description: { contains: term, mode: "insensitive" as const } } } },
          ...(digits ? [{ invoiceNumber: { contains: digits } }, { supplierCnpj: { contains: digits } }] : []),
        ],
      }),
    },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { items: true } }, expenses: { select: { status: true } } },
  });
  const active = purchases.filter((p) => p.status === "ATIVA");
  const totalMonth = active.reduce((t, p) => t + p.totalCents, 0);
  const byKind = Object.entries(
    active.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] ?? 0) + p.totalCents }), {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav basePath="/financeiro/compras" range={range} params={{ q: term }} />
        <Link href="/financeiro/compras/nova" className="btn-primary">+ Lançar nota fiscal</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Compras no mês" value={formatMoney(totalMonth)} tone="red" hint={`${active.length} ${active.length === 1 ? "nota" : "notas"}`} />
        {byKind.slice(0, 2).map(([kind, cents]) => (
          <SummaryCard key={kind} label={kind} value={formatMoney(cents)} />
        ))}
      </div>

      <form className="flex gap-2">
        <input type="hidden" name="mes" value={range.month} />
        <input name="q" defaultValue={term} placeholder="Buscar por fornecedor, número da nota, CNPJ ou produto" className="input max-w-md" />
        <button className="btn-secondary">Buscar</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Emissão</th>
              <th className="px-4 py-2 font-medium">Nota</th>
              <th className="px-4 py-2 font-medium">Fornecedor</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 font-medium">Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => {
              const parcels = p.expenses.filter((e) => e.status !== "CANCELADO");
              const paid = parcels.filter((e) => e.status === "PAGO").length;
              return (
                <tr key={p.id} className={`border-t border-slate-100 ${p.status === "CANCELADA" ? "text-slate-400" : ""}`}>
                  <td className="whitespace-nowrap px-4 py-2">{formatDate(p.issueDate)}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <Link href={`/financeiro/compras/${p.id}`} className="font-medium text-marinho-700 hover:underline">
                      NF {p.invoiceNumber}
                    </Link>
                    <span className="block text-xs text-slate-500">{p._count.items} {p._count.items === 1 ? "item" : "itens"}</span>
                  </td>
                  <td className="px-4 py-2">
                    {p.supplierName}
                    {p.supplierCnpj && <span className="block text-xs text-slate-500">{formatCnpj(p.supplierCnpj)}</span>}
                  </td>
                  <td className="px-4 py-2">{p.kind}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-medium">{formatMoney(p.totalCents)}</td>
                  <td className="px-4 py-2">
                    {p.status === "CANCELADA" ? (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Cancelada</span>
                    ) : paid === parcels.length ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Paga</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        {parcels.length > 1 ? `${paid} de ${parcels.length} parcelas pagas` : "A pagar"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {purchases.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {term ? "Nenhuma nota encontrada neste mês." : "Nenhuma nota fiscal de compra lançada neste mês."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
