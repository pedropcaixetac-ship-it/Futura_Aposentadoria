import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatCpf, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { commission, monthRange } from "@/lib/finance";
import { canIssueInvoice } from "@/lib/permissions";
import { displayName } from "@/lib/staff";
import { MonthNav, SummaryCard } from "../financeiro/ui";
import { ActionForm } from "../financeiro/action-form";
import { toggleHealthReceipt, updateMyMunicipalRegistration } from "../financeiro/notas/actions";
import { InvoiceStatus, PendingInvoice } from "../financeiro/notas/ui";

// Visão pessoal do profissional: o que recebeu dos próprios atendimentos e o repasse do mês.
export default async function MyFinancePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser("meu-financeiro");
  const { mes } = await searchParams;
  const range = monthRange(mes);
  const paidInMonth = { clinicId: user.clinicId, status: "PAGO" as const, paidAt: { gte: range.start, lt: range.end } };

  const [charges, clinic, me, pendingInvoices] = await Promise.all([
    prisma.charge.findMany({
      where: { ...paidInMonth, professionalId: user.id },
      include: { patient: { select: { name: true, cpf: true } }, serviceInvoice: true },
      orderBy: { paidAt: "asc" },
    }),
    prisma.clinic.findUniqueOrThrow({ where: { id: user.clinicId } }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, cpf: true, municipalRegistration: true, jobTitle: true, sex: true } }),
    // Notas pedidas nas cobranças deste profissional, de qualquer mês.
    prisma.serviceInvoice.findMany({
      where: { clinicId: user.clinicId, status: "PEDIDA", charge: { professionalId: user.id } },
      include: { charge: { include: { patient: { select: { name: true, cpf: true } } } } },
      orderBy: { requestedAt: "asc" },
    }),
  ]);
  // Quem emite a própria nota recebe como pessoa física e também lança cada pagamento no Receita Saúde.
  const selfEmployed = clinic.invoiceIssuer === "PROFISSIONAL";
  const professional = { ...me, name: displayName(me) };
  const total = charges.reduce((t, c) => t + c.amountCents, 0);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Meu financeiro</h1>
        <p className="text-sm text-slate-500">O repasse é calculado sobre o que foi efetivamente recebido no mês.</p>
      </div>
      <MonthNav basePath="/meu-financeiro" range={range} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Recebido dos seus atendimentos" value={formatMoney(total)} />
        <SummaryCard label="Sua porcentagem" value={user.commissionPercent != null ? `${user.commissionPercent}%` : "Não definida"} />
        <SummaryCard label="Seu repasse" value={formatMoney(commission(total, user.commissionPercent))} tone="gold" />
      </div>
      {pendingInvoices.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Notas fiscais pedidas pelos seus pacientes</h2>
          <ul className="space-y-3">
            {pendingInvoices.map((inv) => (
              <PendingInvoice
                key={inv.id}
                invoice={inv}
                issuer={inv.issuer}
                clinic={clinic}
                professional={professional}
                charge={inv.charge}
                canIssue={canIssueInvoice(user, inv, inv.charge)}
              />
            ))}
          </ul>
        </div>
      )}
      {selfEmployed && (
        <p className="rounded-md bg-marinho-50 px-4 py-3 text-sm text-marinho-800">
          Como você recebe como pessoa física, cada pagamento precisa do recibo no <strong>Receita Saúde</strong> (app da Receita Federal),
          no dia em que recebeu. Os dados estão na tabela abaixo; marque &quot;Lançado&quot; depois de emitir.
        </p>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Pago em</th>
              <th className="px-4 py-2 font-medium">Paciente</th>
              <th className="px-4 py-2 font-medium">Descrição</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 font-medium">Nota fiscal</th>
              {selfEmployed && <th className="px-4 py-2 font-medium">Receita Saúde</th>}
            </tr>
          </thead>
          <tbody>
            {charges.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{formatDate(c.paidAt)}</td>
                <td className="px-4 py-2">
                  {c.patient.name}
                  {selfEmployed && c.patient.cpf && <span className="block select-all text-xs text-slate-500">CPF {formatCpf(c.patient.cpf)}</span>}
                </td>
                <td className="px-4 py-2">{c.description}</td>
                <td className="px-4 py-2 text-right">{formatMoney(c.amountCents)}</td>
                <td className="px-4 py-2">
                  <InvoiceStatus invoice={c.serviceInvoice} chargeId={c.id} canRequest canIssue={!!c.serviceInvoice && canIssueInvoice(user, c.serviceInvoice, c)} />
                </td>
                {selfEmployed && (
                  <td className="px-4 py-2">
                    <form action={toggleHealthReceipt.bind(null, c.id)}>
                      <button className={`rounded px-2 py-0.5 text-xs ${c.healthReceiptAt ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600 hover:bg-amber-100"}`}>
                        {c.healthReceiptAt ? "✓ Lançado" : "Marcar lançado"}
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {charges.length === 0 && (
              <tr>
                <td colSpan={selfEmployed ? 6 : 5} className="px-4 py-8 text-center text-slate-400">Nenhum pagamento recebido neste mês.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selfEmployed && (
        <ActionForm action={updateMyMunicipalRegistration} submitLabel="Salvar" resetOnSuccess={false} className="card flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <label className="label" htmlFor="municipalRegistration">Sua inscrição municipal (para emitir nota como autônomo)</label>
            <input className="input" id="municipalRegistration" name="municipalRegistration" defaultValue={me.municipalRegistration ?? ""} />
          </div>
        </ActionForm>
      )}
    </div>
  );
}
