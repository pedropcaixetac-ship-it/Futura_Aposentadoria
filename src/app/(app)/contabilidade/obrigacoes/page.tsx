import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { dateInput, monthRange, paymentMethodLabel, today } from "@/lib/finance";
import { obligationDueDate, obligationKinds, trackedSince } from "@/lib/accounting";
import { ActionForm } from "../../financeiro/action-form";
import { MonthNav } from "../../financeiro/ui";
import { completeObligation, createObligation, toggleObligation, undoObligation } from "../actions";
import { ensureObligations, requireAccountingPage } from "../data";

const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function ruleLabel(o: { dueDay: number; businessDay: boolean; onlyMonth: number | null }) {
  const day = o.businessDay ? `${o.dueDay}º dia útil` : `dia ${o.dueDay}`;
  return o.onlyMonth ? `${day} de ${months[o.onlyMonth - 1]} (anual)` : `todo mês, ${day}`;
}

const kindStyle: Record<string, string> = {
  Imposto: "bg-marinho-50 text-marinho-700",
  Trabalhista: "bg-dourado-100 text-dourado-700",
  Envio: "bg-slate-100 text-slate-600",
};

export default async function ObligationsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireAccountingPage();
  await ensureObligations(user.clinicId);
  const { mes } = await searchParams;
  const range = monthRange(mes);
  const now = today();

  const obligations = await prisma.taxObligation.findMany({
    where: { clinicId: user.clinicId },
    include: { entries: { where: { month: range.month } } },
    orderBy: [{ dueDay: "asc" }, { name: "asc" }],
  });
  const expenseIds = obligations.flatMap((o) => o.entries.map((e) => e.expenseId)).filter((id): id is string => !!id);
  const expenses = await prisma.expense.findMany({ where: { id: { in: expenseIds } }, select: { id: true, paymentMethod: true } });

  const thisMonth = obligations
    .filter((o) => o.active)
    .map((o) => ({ o, due: obligationDueDate(o, range.month), entry: o.entries[0] }))
    .filter((x): x is typeof x & { due: Date } => !!x.due)
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  const done = thisMonth.filter((x) => x.entry).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav basePath="/contabilidade/obrigacoes" range={range} />
        <span className="text-sm text-slate-600">
          {done} de {thisMonth.length} feitas
        </span>
      </div>

      <div className="card overflow-x-auto p-0 md:overflow-visible">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Vence</th>
              <th className="px-4 py-2 font-medium">Obrigação</th>
              <th className="px-4 py-2 font-medium">Situação</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {thisMonth.map(({ o, due, entry }) => {
              const tracked = trackedSince(due, o.createdAt);
              const late = !entry && tracked && due < now;
              const method = entry?.expenseId ? expenses.find((x) => x.id === entry.expenseId)?.paymentMethod : null;
              return (
                <tr key={o.id} className="border-t border-slate-100 align-top">
                  <td className={`whitespace-nowrap px-4 py-2 ${late ? "font-medium text-red-700" : ""}`}>{formatDate(due)}</td>
                  <td className="px-4 py-2">
                    <span className="font-medium">{o.name}</span>
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${kindStyle[o.kind] ?? kindStyle.Envio}`}>{o.kind}</span>
                    {o.hint && <span className="block text-xs text-slate-500">{o.hint}</span>}
                  </td>
                  <td className="px-4 py-2">
                    {entry ? (
                      <>
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Feito em {formatDate(entry.doneAt)}</span>
                        {entry.amountCents && (
                          <span className="block text-xs text-slate-500">
                            {formatMoney(entry.amountCents)}
                            {method && ` · ${paymentMethodLabel[method]}`} · lançado no Financeiro
                          </span>
                        )}
                        {entry.notes && <span className="block text-xs text-slate-500">{entry.notes}</span>}
                      </>
                    ) : !tracked ? (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Antes de começar a usar</span>
                    ) : late ? (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">Atrasado</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Pendente</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {entry ? (
                      <form action={undoObligation.bind(null, entry.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">Desfazer</button>
                      </form>
                    ) : (
                      <details className="relative inline-block text-left">
                        <summary className="cursor-pointer list-none rounded-md bg-marinho-700 px-3 py-1 text-xs font-medium text-white hover:bg-marinho-800">
                          {o.kind === "Envio" ? "Marcar como feito" : "Marcar como pago"}
                        </summary>
                        <form action={completeObligation.bind(null, o.id, range.month)} className="absolute right-0 z-10 mt-1 w-64 space-y-2 rounded-md border border-slate-200 bg-white p-3 shadow-lg">
                          <div>
                            <label className="label">Data</label>
                            <input type="date" name="doneAt" className="input" defaultValue={dateInput(now)} required />
                          </div>
                          {o.kind !== "Envio" && (
                            <>
                              <div>
                                <label className="label">Valor pago (R$)</label>
                                <input name="amount" className="input" inputMode="decimal" placeholder="Opcional" />
                              </div>
                              <div>
                                <label className="label">Forma de pagamento</label>
                                <select name="paymentMethod" className="input" defaultValue="">
                                  <option value="">Opcional</option>
                                  {Object.entries(paymentMethodLabel).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                  ))}
                                </select>
                              </div>
                              <p className="text-xs text-slate-500">Com o valor, a guia entra como despesa paga no Financeiro.</p>
                            </>
                          )}
                          <div>
                            <label className="label">Observação</label>
                            <input name="notes" className="input" />
                          </div>
                          <button className="btn-primary w-full">Confirmar</button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
            {thisMonth.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">Nenhuma obrigação neste mês.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="card">
        <summary className="cursor-pointer list-none font-semibold text-marinho-800">Configurar a lista de obrigações</summary>
        <p className="mt-2 text-sm text-slate-500">
          As datas são as mais comuns. Confira com o contador: o ISS muda de cidade para cidade, e clínicas fora do Simples Nacional não pagam
          o DAS. Quando o dia cai em fim de semana, o sistema antecipa para a sexta-feira.
        </p>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {obligations.map((o) => (
            <li key={o.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${o.active ? "" : "text-slate-400"}`}>
              <span>
                <span className="font-medium">{o.name}</span> · {o.kind} · {ruleLabel(o)}
              </span>
              <form action={toggleObligation.bind(null, o.id)}>
                <button className="text-xs text-marinho-700 hover:underline">{o.active ? "Desligar" : "Ligar"}</button>
              </form>
            </li>
          ))}
        </ul>
        <ActionForm action={createObligation} submitLabel="Acrescentar obrigação" className="mt-4 space-y-3 rounded-md bg-marinho-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="obName">Nome</label>
              <input className="input" id="obName" name="name" placeholder="Ex.: Alvará da vigilância sanitária" required />
            </div>
            <div>
              <label className="label" htmlFor="obKind">Tipo</label>
              <select className="input" id="obKind" name="kind" defaultValue="Imposto">
                {obligationKinds.map((k) => (
                  <option key={k} value={k}>{k === "Envio" ? "Envio (sem pagamento)" : k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="obDay">Dia do vencimento</label>
              <input className="input" id="obDay" name="dueDay" inputMode="numeric" placeholder="Ex.: 20" required />
            </div>
            <div>
              <label className="label" htmlFor="obMonth">Repete</label>
              <select className="input" id="obMonth" name="onlyMonth" defaultValue="">
                <option value="">Todo mês</option>
                {months.map((m, i) => (
                  <option key={m} value={i + 1}>Só em {m} (anual)</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="businessDay" className="h-4 w-4 accent-marinho-700" /> Contar em dias úteis
            </label>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="obHint">Lembrete</label>
              <input className="input" id="obHint" name="hint" placeholder="Opcional" />
            </div>
          </div>
        </ActionForm>
      </details>
    </div>
  );
}
