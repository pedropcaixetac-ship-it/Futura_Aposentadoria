import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { billDays, payerKind, payerLabel } from "@/lib/conta-hospitalar";
import { BillsNav } from "./nav";

type Row = {
  id: string;
  admittedAt: Date;
  dischargedAt: Date | null;
  insurance: string | null;
  patient: { name: string; socialName: string | null };
  bed: { code: string; ward: { name: string } };
  bill: { status: string; totalCents: number; payer: string; closedAt: Date | null; chargeId: string | null } | null;
};

function Table({ rows, empty, closed }: { rows: Row[]; empty: string; closed?: boolean }) {
  return (
    <section className="card overflow-x-auto p-0!">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Paciente</th>
            <th className="px-3 py-2">Internação</th>
            <th className="px-3 py-2">Diárias</th>
            <th className="px-3 py-2">Pagador</th>
            <th className="px-3 py-2 text-right">{closed ? "Total" : "Parcial"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">{empty}</td></tr>}
          {rows.map((r) => {
            const payer = r.bill?.payer ?? (r.insurance?.trim() || "Particular");
            return (
              <tr key={r.id}>
                <td className="px-3 py-2"><Link href={`/contas/${r.id}`} className="font-medium text-marinho-700 hover:underline">{r.patient.socialName || r.patient.name}</Link></td>
                <td className="px-3 py-2">{formatDate(r.admittedAt)}{r.dischargedAt ? ` a ${formatDate(r.dischargedAt)}` : ` · ${r.bed.ward.name} ${r.bed.code}`}</td>
                <td className="px-3 py-2">{billDays(r.admittedAt, r.dischargedAt)}</td>
                <td className="px-3 py-2">{payer} <span className="text-xs text-slate-500">({payerLabel[payerKind(payer)]})</span></td>
                <td className="px-3 py-2 text-right">{r.bill ? formatMoney(r.bill.totalCents) : <span className="text-xs text-slate-400">abrir para calcular</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default async function BillsPage() {
  const user = await requireUser("contas");
  const include = {
    patient: { select: { name: true, socialName: true } },
    bed: { select: { code: true, ward: { select: { name: true } } } },
    bill: { select: { status: true, totalCents: true, payer: true, closedAt: true, chargeId: true } },
  } as const;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(3, 0, 0, 0);
  const [toClose, current, closed] = await Promise.all([
    prisma.admission.findMany({ where: { clinicId: user.clinicId, dischargedAt: { not: null }, OR: [{ bill: null }, { bill: { status: "ABERTA" } }] }, include, orderBy: { dischargedAt: "asc" } }),
    prisma.admission.findMany({ where: { clinicId: user.clinicId, dischargedAt: null }, include, orderBy: { admittedAt: "asc" } }),
    prisma.admission.findMany({ where: { clinicId: user.clinicId, bill: { status: "FECHADA" } }, include, orderBy: { bill: { closedAt: "desc" } }, take: 20 }),
  ]);
  const closedThisMonth = await prisma.hospitalBill.aggregate({ where: { clinicId: user.clinicId, status: "FECHADA", closedAt: { gte: monthStart } }, _sum: { totalCents: true }, _count: true });

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas hospitalares</h1>
        <p className="text-sm text-slate-500">A conta de cada internação se monta sozinha com o que os setores registram. Feche depois da alta.</p>
      </div>
      <BillsNav current="contas" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-slate-500">Altas com conta a fechar</p><p className={`text-2xl font-semibold ${toClose.length ? "text-amber-600" : "text-emerald-700"}`}>{toClose.length}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Internados agora</p><p className="text-2xl font-semibold text-marinho-800">{current.length}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Fechado no mês</p><p className="text-2xl font-semibold text-marinho-800">{formatMoney(closedThisMonth._sum.totalCents ?? 0)}</p><p className="text-xs text-slate-500">{closedThisMonth._count} conta(s)</p></div>
      </div>

      <h2 className="font-semibold text-marinho-800">Alta dada: conferir e fechar</h2>
      <Table rows={toClose} empty="Nenhuma conta esperando fechamento." />
      <h2 className="font-semibold text-marinho-800">Internados (conta parcial)</h2>
      <Table rows={current} empty="Ninguém internado." />
      <h2 className="font-semibold text-marinho-800">Fechadas recentemente</h2>
      <Table rows={closed} empty="Nenhuma conta fechada ainda." closed />
    </div>
  );
}
