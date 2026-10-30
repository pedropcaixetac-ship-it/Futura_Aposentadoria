import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatMoney, moneyInput } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { monthRange } from "@/lib/finance";
import { activeInMonth, employmentTypeLabel, fgts, nthBusinessDay } from "@/lib/accounting";
import { ActionForm } from "../../financeiro/action-form";
import { MonthNav } from "../../financeiro/ui";
import { PrintButton } from "../../pacientes/[id]/atendimentos/[encounterId]/print-button";
import { launchPayroll, savePayrollEntry } from "../actions";
import { requireAccountingPage } from "../data";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireAccountingPage();
  const { mes } = await searchParams;
  const range = monthRange(mes);

  const employees = (
    await prisma.employee.findMany({
      where: { clinicId: user.clinicId },
      include: { payrollEntries: { where: { month: range.month } } },
      orderBy: { name: "asc" },
    })
  ).filter((e) => activeInMonth(e, range));

  const rows = employees.map((e) => {
    const entry = e.payrollEntries[0];
    const base = entry?.baseCents ?? e.salaryCents;
    const gross = base + (entry?.additionsCents ?? 0) - (entry?.deductionsCents ?? 0);
    return { e, entry, base, gross, toPay: entry?.netCents ?? gross };
  });
  const total = rows.reduce((t, r) => t + r.toPay, 0);
  const fgtsTotal = rows.reduce((t, r) => t + fgts(r.base, r.e.type), 0);
  const pendingLaunch = rows.filter((r) => !r.entry?.expenseId).length;

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <MonthNav basePath="/contabilidade/folha" range={range} />
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          {pendingLaunch > 0 && (
            <form action={launchPayroll.bind(null, range.month)}>
              <button className="btn-primary">Lançar salários no Financeiro ({pendingLaunch})</button>
            </form>
          )}
        </div>
      </div>

      <div className="card space-y-1 text-sm">
        <h2 className="text-base font-semibold">Folha de {range.label} · {user.clinic.name}</h2>
        <p className="text-slate-600">
          Anote faltas, horas extras, adiantamentos e outros acontecimentos do mês e envie ao contador. Quando ele devolver o valor líquido de
          cada um, preencha em &quot;Líquido&quot;. Pagamento até {formatDate(nthBusinessDay(range.next, 5))} (5º dia útil).
        </p>
        <p>
          A pagar: <strong>{formatMoney(total)}</strong>
          <span className="mx-2 text-slate-300">·</span>
          FGTS estimado (8% CLT): <strong>{formatMoney(fgtsTotal)}</strong>
        </p>
      </div>

      {rows.length === 0 && (
        <div className="card text-center text-sm text-slate-400">
          Nenhum funcionário ativo neste mês. <Link href="/contabilidade/funcionarios/novo" className="text-marinho-700 hover:underline">Cadastrar funcionário</Link>
        </div>
      )}

      {rows.map(({ e, entry, base, gross, toPay }) => (
        <div key={e.id} className="card space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <Link href={`/contabilidade/funcionarios/${e.id}`} className="font-semibold text-marinho-800 hover:underline">{e.name}</Link>
              <span className="text-sm text-slate-500"> · {e.jobTitle} · {employmentTypeLabel[e.type].split(" (")[0]} · salário {formatMoney(base)}</span>
            </div>
            <div className="text-sm">
              {entry?.netCents ? "Líquido" : "Bruto"}: <strong>{formatMoney(toPay)}</strong>
              {entry?.expenseId ? (
                <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">lançado no Financeiro</span>
              ) : null}
            </div>
          </div>
          <ActionForm
            action={savePayrollEntry.bind(null, e.id, range.month)}
            submitLabel="Salvar"
            resetOnSuccess={false}
            className="no-print space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <label className="label" htmlFor={`abs-${e.id}`}>Faltas (dias)</label>
                <input className="input" id={`abs-${e.id}`} name="absenceDays" inputMode="numeric" defaultValue={entry?.absenceDays || ""} />
              </div>
              <div>
                <label className="label" htmlFor={`ot-${e.id}`}>Horas extras</label>
                <input className="input" id={`ot-${e.id}`} name="overtimeHours" inputMode="numeric" defaultValue={entry?.overtimeHours || ""} />
              </div>
              <div>
                <label className="label" htmlFor={`add-${e.id}`}>Outros ganhos (R$)</label>
                <input className="input" id={`add-${e.id}`} name="additions" inputMode="decimal" placeholder="Bônus, comissão" defaultValue={entry?.additionsCents ? moneyInput(entry.additionsCents) : ""} />
              </div>
              <div>
                <label className="label" htmlFor={`ded-${e.id}`}>Descontos (R$)</label>
                <input className="input" id={`ded-${e.id}`} name="deductions" inputMode="decimal" placeholder="Adiantamento, vale" defaultValue={entry?.deductionsCents ? moneyInput(entry.deductionsCents) : ""} />
              </div>
              <div>
                <label className="label" htmlFor={`net-${e.id}`}>Líquido (do contador)</label>
                <input className="input" id={`net-${e.id}`} name="net" inputMode="decimal" placeholder={`Bruto: ${moneyInput(gross)}`} defaultValue={entry?.netCents ? moneyInput(entry.netCents) : ""} />
              </div>
              <div>
                <label className="label" htmlFor={`notes-${e.id}`}>Observação</label>
                <input className="input" id={`notes-${e.id}`} name="notes" defaultValue={entry?.notes ?? ""} />
              </div>
            </div>
          </ActionForm>
          {/* Versão para impressão, sem campos. */}
          <p className="hidden text-sm print:block">
            Faltas: {entry?.absenceDays ?? 0} · Horas extras: {entry?.overtimeHours ?? 0} · Outros ganhos: {formatMoney(entry?.additionsCents ?? 0)} ·
            Descontos: {formatMoney(entry?.deductionsCents ?? 0)}
            {entry?.notes && ` · ${entry.notes}`}
          </p>
        </div>
      ))}
    </div>
  );
}
