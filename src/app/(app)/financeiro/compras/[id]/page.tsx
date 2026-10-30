import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { paymentMethodLabel, today } from "@/lib/finance";
import { formatCnpj } from "@/lib/purchase";
import { cancelPurchase, payExpense } from "../../actions";
import { PayForm, StatusBadge } from "../../ui";

// Aviso de validade: vencido, ou vencendo nos próximos 90 dias.
function ExpiryBadge({ date }: { date: Date | null }) {
  if (!date) return null;
  const days = Math.round((date.getTime() - today().getTime()) / 86400000);
  if (days < 0) return <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">Vencido</span>;
  if (days <= 90) return <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">Vence em {days} dias</span>;
  return null;
}

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!canManageFinance(user)) notFound();
  const { id } = await params;
  const purchase = await prisma.purchase.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { items: { orderBy: { position: "asc" } }, expenses: { orderBy: { installment: "asc" } } },
  });
  if (!purchase) notFound();
  const author = await prisma.user.findFirst({ where: { id: purchase.createdById, clinicId: user.clinicId }, select: { name: true } });
  const cancelled = purchase.status === "CANCELADA";

  return (
    <div className="max-w-5xl space-y-5">
      <Link href={`/financeiro/compras?mes=${purchase.issueDate.toISOString().slice(0, 7)}`} className="text-sm text-marinho-700 hover:underline">
        ‹ Voltar para Compras
      </Link>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{purchase.kind}</p>
            <h2 className="text-xl font-semibold text-marinho-800">
              NF {purchase.invoiceNumber}
              {purchase.invoiceSeries && <span className="text-base font-normal text-slate-500"> · série {purchase.invoiceSeries}</span>}
              {cancelled && <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 align-middle text-xs font-normal text-slate-500">Cancelada</span>}
            </h2>
            <p className="text-slate-700">
              {purchase.supplierName}
              {purchase.supplierCnpj && <span className="text-slate-500"> · CNPJ {formatCnpj(purchase.supplierCnpj)}</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Valor da nota</p>
            <p className="text-2xl font-semibold text-marinho-800">{formatMoney(purchase.totalCents)}</p>
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-slate-500">Emissão: </dt><dd className="inline">{formatDate(purchase.issueDate)}</dd></div>
          <div><dt className="inline text-slate-500">Lançada por: </dt><dd className="inline">{author?.name ?? "—"} em {formatDateTime(purchase.createdAt)}</dd></div>
          {purchase.accessKey && (
            <div className="sm:col-span-2"><dt className="inline text-slate-500">Chave de acesso: </dt><dd className="inline font-mono text-xs">{purchase.accessKey.replace(/(\d{4})(?=\d)/g, "$1 ")}</dd></div>
          )}
          {purchase.notes && <div className="sm:col-span-2"><dt className="inline text-slate-500">Observação: </dt><dd className="inline">{purchase.notes}</dd></div>}
        </dl>
      </div>

      <div className="card overflow-x-auto p-0">
        <h3 className="px-4 pt-4 font-semibold text-marinho-800">Itens</h3>
        <table className="mt-2 w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Produto</th>
              <th className="px-4 py-2 text-right font-medium">Qtd.</th>
              <th className="px-4 py-2 text-right font-medium">Valor unit.</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2 font-medium">Lote</th>
              <th className="px-4 py-2 font-medium">Validade</th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{item.description}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {Number(item.quantity).toLocaleString("pt-BR")} {item.unit}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">{formatMoney(item.unitPriceCents)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium">{formatMoney(item.totalCents)}</td>
                <td className="px-4 py-2">{item.batch ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-2">
                  {item.expiresAt ? formatDate(item.expiresAt) : "—"}
                  {!cancelled && <ExpiryBadge date={item.expiresAt} />}
                </td>
              </tr>
            ))}
            {purchase.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">Os itens desta nota não foram informados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto p-0">
        <h3 className="px-4 pt-4 font-semibold text-marinho-800">Pagamento</h3>
        <p className="px-4 text-sm text-slate-500">Estas parcelas também aparecem na aba Despesas.</p>
        <table className="mt-2 w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Parcela</th>
              <th className="px-4 py-2 font-medium">Vencimento</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 font-medium">Situação</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {purchase.expenses.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{e.installment}/{purchase.expenses.length}</td>
                <td className="whitespace-nowrap px-4 py-2">{formatDate(e.dueDate)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium">{formatMoney(e.amountCents)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={e.status} dueDate={e.dueDate} />
                  {e.status === "PAGO" && e.paymentMethod && (
                    <span className="block text-xs text-slate-500">{paymentMethodLabel[e.paymentMethod]} · {formatDate(e.paidAt)}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {e.status === "PENDENTE" && <PayForm action={payExpense.bind(null, e.id)} label="Pagar" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!cancelled && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500 hover:text-red-700">Lançou errado? Cancelar esta nota</summary>
          <form action={cancelPurchase.bind(null, purchase.id)} className="mt-2 flex flex-wrap items-center gap-3 rounded-md bg-red-50 p-3">
            <span className="text-red-800">A nota e todas as parcelas dela (inclusive as já pagas) serão canceladas.</span>
            <button className="rounded-md bg-red-700 px-3 py-1.5 text-white hover:bg-red-800">Confirmar cancelamento</button>
          </form>
        </details>
      )}
    </div>
  );
}
