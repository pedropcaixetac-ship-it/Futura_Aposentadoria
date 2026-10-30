import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canCancelCharge, canManageCharges } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { monthRange, paymentMethodLabel, today } from "@/lib/finance";
import { cancelCharge, receiveCharge } from "../actions";
import { MonthNav, PayForm, StatusBadge } from "../ui";
import { displayName } from "@/lib/staff";

const filters = [
  { value: "", label: "Todas" },
  { value: "pendente", label: "Pendentes" },
  { value: "atrasado", label: "Atrasadas" },
  { value: "pago", label: "Pagas" },
  { value: "cancelado", label: "Canceladas" },
];

export default async function ChargesPage({ searchParams }: { searchParams: Promise<{ mes?: string; situacao?: string }> }) {
  const user = await requireUser("financeiro");
  if (!canManageCharges(user)) notFound();
  const { mes, situacao = "" } = await searchParams;
  const range = monthRange(mes);
  const clinicId = user.clinicId;

  // "Atrasadas" mostra todas as cobranças vencidas, de qualquer mês.
  const where: Prisma.ChargeWhereInput =
    situacao === "atrasado"
      ? { clinicId, status: "PENDENTE", dueDate: { lt: today() } }
      : {
          clinicId,
          dueDate: { gte: range.start, lt: range.end },
          ...(situacao === "pendente" && { status: "PENDENTE" }),
          ...(situacao === "pago" && { status: "PAGO" }),
          ...(situacao === "cancelado" && { status: "CANCELADO" }),
        };

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
  const [charges, toBill] = await Promise.all([
    prisma.charge.findMany({
      where,
      include: { patient: true, professional: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 300,
    }),
    prisma.encounter.findMany({
      where: {
        clinicId,
        status: "FINALIZADO",
        finalizedAt: { gte: ninetyDaysAgo },
        charges: { none: { status: { not: "CANCELADO" } } },
      },
      select: { id: true, finalizedAt: true, patient: { select: { name: true, insurance: true } }, professional: { select: { name: true, jobTitle: true, sex: true } } },
      orderBy: { finalizedAt: "desc" },
      take: 20,
    }),
  ]);

  const sum = (status: string) => charges.filter((c) => c.status === status).reduce((t, c) => t + c.amountCents, 0);

  return (
    <div className="space-y-5">
      {toBill.length > 0 && (
        <div className="card space-y-3 border-dourado-300 bg-dourado-100/40">
          <h2 className="font-semibold">Atendimentos ainda sem cobrança</h2>
          <ul className="divide-y divide-dourado-300/50 text-sm">
            {toBill.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{e.patient.name}</span>
                  <span className="text-slate-500">
                    {" "}· {displayName(e.professional)} · {formatDateTime(e.finalizedAt)}
                    {e.patient.insurance && ` · ${e.patient.insurance}`}
                  </span>
                </span>
                <Link href={`/financeiro/receitas/nova?atendimento=${e.id}`} className="btn-primary px-3! py-1! text-xs!">
                  Cobrar
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {situacao === "atrasado" ? (
          <p className="font-medium text-red-700">Todas as cobranças atrasadas</p>
        ) : (
          <MonthNav basePath="/financeiro/receitas" range={range} params={{ situacao }} />
        )}
        <Link href="/financeiro/receitas/nova" className="btn-primary">+ Nova cobrança</Link>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={`/financeiro/receitas?${new URLSearchParams({ mes: range.month, ...(f.value && { situacao: f.value }) })}`}
            className={`rounded-full border px-3 py-1 ${
              situacao === f.value ? "border-marinho-700 bg-marinho-700 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-marinho-400"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Vencimento</th>
              <th className="px-4 py-2 font-medium">Paciente</th>
              <th className="px-4 py-2 font-medium">Descrição</th>
              <th className="px-4 py-2 font-medium">Profissional</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 font-medium">Situação</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {charges.map((c) => (
              <tr key={c.id} className={`border-t border-slate-100 ${c.status === "CANCELADO" ? "text-slate-400" : ""}`}>
                <td className="whitespace-nowrap px-4 py-2">{formatDate(c.dueDate)}</td>
                <td className="px-4 py-2 font-medium">{c.patient.name}</td>
                <td className="px-4 py-2">{c.description}</td>
                <td className="px-4 py-2">{c.professional ? displayName(c.professional) : "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium">{formatMoney(c.amountCents)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={c.status} dueDate={c.dueDate} />
                  {c.status === "PAGO" && c.paymentMethod && (
                    <span className="block text-xs text-slate-500">
                      {paymentMethodLabel[c.paymentMethod]} · {formatDate(c.paidAt)}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {c.status === "PENDENTE" && <PayForm action={receiveCharge.bind(null, c.id)} label="Receber" />}
                    {c.status === "PAGO" && (
                      <Link href={`/financeiro/receitas/${c.id}/recibo`} className="text-xs font-medium text-marinho-700 hover:underline">
                        Recibo
                      </Link>
                    )}
                    {canCancelCharge(user, c) && (
                      <form action={cancelCharge.bind(null, c.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">Cancelar</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {charges.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhuma cobrança encontrada.</td>
              </tr>
            )}
          </tbody>
          {charges.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <td colSpan={7} className="px-4 py-2 text-right">
                  Recebido: <strong className="text-emerald-700">{formatMoney(sum("PAGO"))}</strong>
                  <span className="mx-3">·</span>
                  Pendente: <strong className="text-dourado-700">{formatMoney(sum("PENDENTE"))}</strong>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
