import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePlatformUser } from "@/lib/painel-auth";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { billingLabel, billingStatus, clinicBlocked, todayDate } from "@/lib/plans";
import { lastMonths, monthKey, monthLabel, monthRange, PAYMENT_METHODS, type PaymentMethod } from "@/lib/painel-financeiro";
import { ChargeLink } from "../charge-link";

const statusColor: Record<string, string> = { "vence-logo": "text-dourado-700", atrasada: "text-red-700", bloqueada: "text-red-700" };

// Mensalidades que as clínicas pagaram à empresa e quem precisa ser cobrado.
export default async function PlatformFinancePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requirePlatformUser();
  const current = monthKey(todayDate());
  const { mes } = await searchParams;
  const month = mes && monthRange(mes) ? mes : current;
  const range = monthRange(month)!;
  const months = lastMonths(month, 12);
  const since = monthRange(months[0])!.start;

  const [payments, history, clinics] = await Promise.all([
    prisma.clinicPayment.findMany({
      where: { paidAt: { gte: range.start, lt: range.end } },
      include: { clinic: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.clinicPayment.findMany({ where: { paidAt: { gte: since, lt: range.end }, canceledAt: null }, select: { paidAt: true, amountCents: true } }),
    prisma.clinic.findMany({ where: { planId: { not: null } }, include: { plan: true }, orderBy: { paidUntil: "asc" } }),
  ]);

  const received = payments.filter((p) => !p.canceledAt).reduce((sum, p) => sum + p.amountCents, 0);
  const byMonth = months.map((m) => ({ month: m, cents: history.filter((p) => monthKey(p.paidAt) === m).reduce((s, p) => s + p.amountCents, 0) }));
  const maxMonth = Math.max(1, ...byMonth.map((m) => m.cents));
  const expected = clinics.filter((c) => !clinicBlocked(c)).reduce((sum, c) => sum + (c.plan?.priceCents ?? 0), 0);
  // Quem precisa de lembrete ou cobrança: vence em até 5 dias, atrasada ou bloqueada pelo atraso.
  const toCharge = clinics
    .filter((c) => c.active && c.paidUntil)
    .map((c) => ({ clinic: c, status: billingStatus(c.paidUntil) }))
    .filter(({ status }) => ["vence-logo", "atrasada", "bloqueada"].includes(status.kind));
  const lateCents = toCharge.filter(({ status }) => status.kind !== "vence-logo").reduce((s, { clinic }) => s + (clinic.plan?.priceCents ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-marinho-800">Financeiro</h1>
        <form className="flex items-center gap-2">
          <select className="input" name="mes" defaultValue={month}>
            {lastMonths(current, 24).reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button className="btn-secondary">Ver</button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card"><p className="text-sm text-slate-500">Recebido em {monthLabel(month)}</p><p className="text-2xl font-semibold text-emerald-700">{formatMoney(received)}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Receita mensal prevista</p><p className="text-2xl font-semibold text-marinho-800">{formatMoney(expected)}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Em atraso</p><p className="text-2xl font-semibold text-red-700">{formatMoney(lateCents)}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Instituições com plano</p><p className="text-2xl font-semibold text-marinho-800">{clinics.length}</p></div>
      </div>

      <section className="card space-y-3">
        <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">Recebido nos últimos 12 meses</h2>
        <ul className="space-y-1.5 text-sm">
          {byMonth.map((m) => (
            <li key={m.month} className="grid grid-cols-[4.5rem_1fr_6.5rem] items-center gap-3">
              <Link href={`/painel/financeiro?mes=${m.month}`} className={m.month === month ? "font-semibold text-marinho-800" : "text-slate-600 hover:underline"}>
                {monthLabel(m.month, true)}
              </Link>
              <div className="h-4 rounded-sm bg-slate-100">
                <div className="h-4 rounded-sm bg-marinho-600" style={{ width: `${(m.cents / maxMonth) * 100}%` }} />
              </div>
              <span className="text-right tabular-nums text-slate-700">{formatMoney(m.cents)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">Cobranças e lembretes</h2>
        {toCharge.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma mensalidade vencendo ou atrasada. Tudo em dia.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {toCharge.map(({ clinic, status }) => (
              <li key={clinic.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <Link href={`/painel/clinicas/${clinic.id}`} className="font-medium text-marinho-700 hover:underline">{clinic.name}</Link>
                <span className="text-slate-500">{clinic.plan?.name} · {formatMoney(clinic.plan?.priceCents ?? 0)} · vencimento {formatDate(clinic.paidUntil)}</span>
                <span className={`font-semibold ${statusColor[status.kind]}`}>{billingLabel(status)}</span>
                <span className="ml-auto">
                  <ChargeLink clinic={clinic} label={status.kind === "vence-logo" ? "Lembrar no WhatsApp" : "Cobrar no WhatsApp"} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">
          O botão abre o WhatsApp com a mensagem pronta para o responsável pela instituição; quem aperta enviar é você.
          {!process.env.PAINEL_PIX_CHAVE && " Para a mensagem levar a sua chave Pix, peça para configurar PAINEL_PIX_CHAVE."}
        </p>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dourado-300 pb-2">
          <h2 className="font-semibold text-marinho-800">Pagamentos de {monthLabel(month)}</h2>
          {payments.length > 0 && (
            <a href={`/painel/financeiro/planilha?mes=${month}`} className="text-sm text-marinho-700 hover:underline">Baixar planilha (Excel)</a>
          )}
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum pagamento registrado neste mês. Registre na página de cada instituição.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-marinho-700">
                <tr>
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Instituição</th>
                  <th className="py-2 pr-4 text-right">Valor</th>
                  <th className="py-2 pr-4">Forma</th>
                  <th className="py-2 pr-4">Pago até</th>
                  <th className="py-2 pr-4">Registrado por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className={p.canceledAt ? "text-slate-400" : undefined}>
                    <td className="py-2 pr-4">{formatDate(p.paidAt)}</td>
                    <td className="py-2 pr-4"><Link href={`/painel/clinicas/${p.clinic.id}`} className="hover:underline">{p.clinic.name}</Link></td>
                    <td className={`py-2 pr-4 text-right tabular-nums ${p.canceledAt ? "line-through" : ""}`}>{formatMoney(p.amountCents)}</td>
                    <td className="py-2 pr-4">{PAYMENT_METHODS[p.method as PaymentMethod] ?? p.method}{p.canceledAt && " (desfeito)"}</td>
                    <td className="py-2 pr-4">{formatDate(p.paidUntil)}</td>
                    <td className="py-2 pr-4">{p.createdBy.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
