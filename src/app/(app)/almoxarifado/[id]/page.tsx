import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { supplyBalance, supplyMovementLabel } from "@/lib/almoxarifado";
import { ActionForm } from "../../financeiro/action-form";
import { adjustSupply } from "../actions";

// Um item: saldo, movimentações (entradas, saídas por setor, ajustes) e ajuste de contagem ou perda.
export default async function SupplyItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("almoxarifado");
  const { id } = await params;
  const item = await prisma.supplyItem.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!item) notFound();
  const movements = await prisma.supplyMovement.findMany({
    where: { clinicId: user.clinicId, itemId: item.id },
    include: { user: { select: { name: true, sex: true, jobTitle: true } } },
    orderBy: { at: "desc" },
  });
  const balance = supplyBalance(movements);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/almoxarifado" className="text-sm text-marinho-700 hover:underline">← Almoxarifado</Link>
        <h1 className="mt-1 text-2xl font-semibold">{item.name}</h1>
        <p className="text-sm text-slate-500">{item.category} · saldo <strong>{balance} {item.unit}(s)</strong> · mínimo {item.minStock}</p>
      </div>

      <ActionForm action={adjustSupply.bind(null, item.id)} submitLabel="Registrar">
        <h2 className="font-semibold text-marinho-800">Ajuste de contagem ou perda</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="kind">Tipo</label>
            <select className="input" id="kind" name="kind" defaultValue="PERDA">
              <option value="PERDA">Perda / estragou</option>
              <option value="AJUSTE_MENOS">Contagem: tem menos</option>
              <option value="AJUSTE_MAIS">Contagem: tem mais</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="quantity">Quantidade</label>
            <input className="input" id="quantity" name="quantity" type="number" min={1} required />
          </div>
          <div>
            <label className="label" htmlFor="note">Motivo</label>
            <input className="input" id="note" name="note" required />
          </div>
        </div>
      </ActionForm>

      <section className="card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Movimento</th>
              <th className="px-3 py-2">Qtd.</th>
              <th className="px-3 py-2">Detalhe</th>
              <th className="px-3 py-2">Quem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {movements.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nenhuma movimentação.</td></tr>}
            {movements.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(m.at)}</td>
                <td className="px-3 py-2">{supplyMovementLabel[m.kind]}</td>
                <td className={`px-3 py-2 font-medium ${m.quantity > 0 ? "text-emerald-700" : "text-red-700"}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                <td className="px-3 py-2 text-slate-600">{[m.sector, m.invoice && `NF ${m.invoice}`, m.note].filter(Boolean).join(" · ")}</td>
                <td className="px-3 py-2">{displayName(m.user)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
