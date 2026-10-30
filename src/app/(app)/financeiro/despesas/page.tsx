import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { dateInput, expenseCategories, monthRange, paymentMethodLabel, today } from "@/lib/finance";
import { cancelExpense, createExpense, payExpense } from "../actions";
import { ActionForm } from "../action-form";
import { MonthNav, PayForm, StatusBadge } from "../ui";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser();
  if (!canManageFinance(user)) notFound();
  const { mes } = await searchParams;
  const range = monthRange(mes);

  const expenses = await prisma.expense.findMany({
    where: { clinicId: user.clinicId, dueDate: { gte: range.start, lt: range.end } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
  const sum = (status: string) => expenses.filter((e) => e.status === status).reduce((t, e) => t + e.amountCents, 0);

  return (
    <div className="space-y-5">
      <MonthNav basePath="/financeiro/despesas" range={range} />

      <details className="card group">
        <summary className="cursor-pointer list-none font-semibold text-marinho-800">
          <span className="group-open:hidden">+ Nova despesa</span>
          <span className="hidden group-open:inline">Nova despesa</span>
        </summary>
        <ActionForm action={createExpense} submitLabel="Salvar despesa" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="description">Descrição *</label>
              <input className="input" id="description" name="description" placeholder="Ex.: Aluguel da sala" required />
            </div>
            <div>
              <label className="label" htmlFor="category">Categoria *</label>
              <select className="input" id="category" name="category" defaultValue="" required>
                <option value="" disabled>Escolha...</option>
                {expenseCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="amount">Valor (R$) *</label>
              <input className="input" id="amount" name="amount" inputMode="decimal" placeholder="0,00" required />
            </div>
            <div>
              <label className="label" htmlFor="dueDate">Vencimento *</label>
              <input className="input" id="dueDate" name="dueDate" type="date" defaultValue={dateInput(today())} required />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="notes">Observação</label>
              <input className="input" id="notes" name="notes" />
            </div>
          </div>
          <details className="rounded-md bg-marinho-50 p-4">
            <summary className="cursor-pointer text-sm font-medium">Já foi paga? Clique para informar o pagamento</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="paidNow" className="h-4 w-4 accent-marinho-700" /> Sim, esta despesa já foi paga
              </label>
              <div>
                <label className="label">Forma de pagamento</label>
                <select name="paymentMethod" className="input" defaultValue="">
                  <option value="">Escolha...</option>
                  {Object.entries(paymentMethodLabel).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Data do pagamento</label>
                <input type="date" name="paidAt" className="input" defaultValue={dateInput(today())} />
              </div>
            </div>
          </details>
        </ActionForm>
      </details>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Vencimento</th>
              <th className="px-4 py-2 font-medium">Descrição</th>
              <th className="px-4 py-2 font-medium">Categoria</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 font-medium">Situação</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className={`border-t border-slate-100 ${e.status === "CANCELADO" ? "text-slate-400" : ""}`}>
                <td className="whitespace-nowrap px-4 py-2">{formatDate(e.dueDate)}</td>
                <td className="px-4 py-2 font-medium">
                  {e.description}
                  {e.notes && <span className="block text-xs font-normal text-slate-500">{e.notes}</span>}
                </td>
                <td className="px-4 py-2">{e.category}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium">{formatMoney(e.amountCents)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={e.status} dueDate={e.dueDate} />
                  {e.status === "PAGO" && e.paymentMethod && (
                    <span className="block text-xs text-slate-500">{paymentMethodLabel[e.paymentMethod]} · {formatDate(e.paidAt)}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {e.status === "PENDENTE" && <PayForm action={payExpense.bind(null, e.id)} label="Pagar" />}
                    {e.status !== "CANCELADO" && (
                      <form action={cancelExpense.bind(null, e.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">Cancelar</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhuma despesa neste mês.</td>
              </tr>
            )}
          </tbody>
          {expenses.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <td colSpan={6} className="px-4 py-2 text-right">
                  Pago: <strong className="text-red-700">{formatMoney(sum("PAGO"))}</strong>
                  <span className="mx-3">·</span>
                  A pagar: <strong className="text-dourado-700">{formatMoney(sum("PENDENTE"))}</strong>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
