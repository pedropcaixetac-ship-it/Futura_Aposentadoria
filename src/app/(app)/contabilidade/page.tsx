import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { monthRange, today } from "@/lib/finance";
import { activeInMonth, fgts, laborAlerts, obligationDueDate, trackedSince } from "@/lib/accounting";
import { SummaryCard } from "../financeiro/ui";
import { ensureObligations, requireAccountingPage } from "./data";

export default async function AccountingSummaryPage() {
  const user = await requireAccountingPage();
  const clinicId = user.clinicId;
  await ensureObligations(clinicId);
  const now = today();
  const range = monthRange();
  const nextRange = monthRange(range.next);

  const [employees, obligations] = await Promise.all([
    prisma.employee.findMany({ where: { clinicId }, include: { vacations: true }, orderBy: { name: "asc" } }),
    prisma.taxObligation.findMany({
      where: { clinicId, active: true },
      include: { entries: { where: { month: { in: [range.month, nextRange.month] } } } },
    }),
  ]);

  const active = employees.filter((e) => !e.terminatedAt);
  const payroll = employees.filter((e) => activeInMonth(e, range)).reduce((t, e) => t + e.salaryCents, 0);
  const fgtsTotal = employees.filter((e) => activeInMonth(e, range)).reduce((t, e) => t + fgts(e.salaryCents, e.type), 0);

  // Obrigações deste mês e do próximo que ainda não foram feitas.
  const pending = [range, nextRange]
    .flatMap((r) =>
      obligations.map((o) => ({ o, month: r.month, due: obligationDueDate(o, r.month), done: o.entries.some((e) => e.month === r.month) })),
    )
    .filter((x): x is typeof x & { due: Date } => !!x.due && !x.done && trackedSince(x.due, x.o.createdAt))
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  const overdue = pending.filter((x) => x.due < now);
  const upcoming = pending.filter((x) => x.due >= now && x.due.getTime() - now.getTime() <= 30 * 86400000);

  const alerts = active.flatMap((e) => laborAlerts(e, e.vacations, now).map((a) => ({ ...a, employee: e })));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Funcionários ativos" value={String(active.length)} hint={`${employees.length - active.length} desligado(s)`} />
        <SummaryCard label="Salários do mês" value={formatMoney(payroll)} hint={`Soma dos salários base · ${range.label}`} />
        <SummaryCard label="FGTS estimado" value={formatMoney(fgtsTotal)} tone="gold" hint="8% dos salários CLT" />
        <SummaryCard
          label="Obrigações atrasadas"
          value={String(overdue.length)}
          tone={overdue.length ? "red" : "green"}
          hint={overdue.length ? "Veja abaixo o que falta" : "Tudo em dia"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-semibold">Próximos vencimentos</h2>
          {overdue.length + upcoming.length === 0 ? (
            <p className="text-sm text-slate-400">Nada vencendo nos próximos 30 dias.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {[...overdue, ...upcoming].map((x) => (
                <li key={x.o.id + x.month} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{x.o.name}</span>
                    <span className="text-slate-500"> · {x.o.kind}</span>
                  </span>
                  <span className={x.due < now ? "font-medium text-red-700" : "text-slate-600"}>
                    {x.due < now ? "Venceu em " : ""}
                    {formatDate(x.due)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/contabilidade/obrigacoes" className="text-sm text-marinho-700 hover:underline">Ver todas as obrigações →</Link>
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold">Avisos trabalhistas</h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum aviso de férias ou contrato de experiência.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {alerts.map((a, i) => (
                <li key={i} className="py-2">
                  <Link href={`/contabilidade/funcionarios/${a.employee.id}`} className="font-medium hover:underline">{a.employee.name}</Link>
                  <span className={`block ${a.tone === "red" ? "text-red-700" : "text-dourado-700"}`}>{a.text}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/contabilidade/funcionarios" className="text-sm text-marinho-700 hover:underline">Ver funcionários →</Link>
        </div>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Fechamento do mês para o contador</h2>
          <p className="text-sm text-slate-500">Planilha com receitas, despesas e folha do mês, que abre no Excel.</p>
        </div>
        <div className="flex gap-2">
          <a href={`/contabilidade/exportar?mes=${range.prev}`} className="btn-secondary">{monthRange(range.prev).label}</a>
          <a href={`/contabilidade/exportar?mes=${range.month}`} className="btn-primary">{range.label}</a>
        </div>
      </div>
    </div>
  );
}
