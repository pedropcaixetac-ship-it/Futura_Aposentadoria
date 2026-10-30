import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { commission, monthRange } from "@/lib/finance";
import { MonthNav, SummaryCard } from "../financeiro/ui";

// Visão pessoal do profissional: o que recebeu dos próprios atendimentos e o repasse do mês.
export default async function MyFinancePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser("meu-financeiro");
  const { mes } = await searchParams;
  const range = monthRange(mes);
  const paidInMonth = { clinicId: user.clinicId, status: "PAGO" as const, paidAt: { gte: range.start, lt: range.end } };

  const charges = await prisma.charge.findMany({
    where: { ...paidInMonth, professionalId: user.id },
    include: { patient: { select: { name: true } } },
    orderBy: { paidAt: "asc" },
  });
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
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Pago em</th>
              <th className="px-4 py-2 font-medium">Paciente</th>
              <th className="px-4 py-2 font-medium">Descrição</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {charges.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{formatDate(c.paidAt)}</td>
                <td className="px-4 py-2">{c.patient.name}</td>
                <td className="px-4 py-2">{c.description}</td>
                <td className="px-4 py-2 text-right">{formatMoney(c.amountCents)}</td>
              </tr>
            ))}
            {charges.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">Nenhum pagamento recebido neste mês.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
