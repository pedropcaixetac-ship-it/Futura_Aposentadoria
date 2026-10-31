import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { expiryState, lotBalances, movementLabel } from "@/lib/farmacia";
import { ActionForm } from "../../../financeiro/action-form";
import { adjustStock } from "../../actions";

const expiryTone = { VENCIDO: "text-red-700 font-semibold", VENCE_EM_BREVE: "text-amber-700", OK: "" };

// Um produto: lotes com saldo, movimentações (entradas, saídas, ajustes) e o ajuste de inventário.
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("farmacia");
  const { id } = await params;
  const product = await prisma.pharmacyProduct.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!product) notFound();
  const movements = await prisma.stockMovement.findMany({
    where: { clinicId: user.clinicId, productId: product.id },
    include: { user: { select: { name: true, sex: true, jobTitle: true } }, patient: { select: { name: true } } },
    orderBy: { at: "desc" },
  });
  const lots = lotBalances(movements);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/farmacia/estoque" className="text-sm text-marinho-700 hover:underline">← Estoque</Link>
        <h1 className="mt-1 text-2xl font-semibold">{product.name} {product.presentation && <span className="text-slate-500">{product.presentation}</span>}</h1>
        <p className="text-sm text-slate-500">Unidade: {product.unit} · mínimo {product.minStock}{product.controlled && " · controlado"}</p>
      </div>

      <section className="card space-y-2">
        <h2 className="font-semibold text-marinho-800">Lotes com saldo (ordem de saída)</h2>
        {lots.length === 0 && <p className="text-sm text-slate-500">Sem saldo.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {lots.map((l) => {
            const state = expiryState(l.expiresAt);
            return (
              <li key={l.lot} className="flex justify-between py-1.5">
                <span>Lote <strong>{l.lot}</strong> · validade <span className={expiryTone[state]}>{l.expiresAt ? formatDate(l.expiresAt) : "—"}{state === "VENCIDO" && " (vencido: dê baixa como perda)"}</span></span>
                <span>{l.balance} {product.unit}(s)</span>
              </li>
            );
          })}
        </ul>
      </section>

      {lots.length > 0 && (
        <ActionForm action={adjustStock.bind(null, product.id)} submitLabel="Registrar">
          <h2 className="font-semibold text-marinho-800">Ajuste de inventário ou perda</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="kind">Tipo</label>
              <select className="input" id="kind" name="kind" defaultValue="PERDA">
                <option value="PERDA">Perda / vencido / quebrado</option>
                <option value="AJUSTE_MENOS">Contagem: tem menos</option>
                <option value="AJUSTE_MAIS">Contagem: tem mais</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="lot">Lote</label>
              <select className="input" id="lot" name="lot" required>
                {lots.map((l) => <option key={l.lot} value={l.lot}>{l.lot} ({l.balance})</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="quantity">Quantidade</label>
              <input className="input" id="quantity" name="quantity" type="number" min={1} required />
            </div>
            <div>
              <label className="label" htmlFor="note">Motivo</label>
              <input className="input" id="note" name="note" required placeholder="Ex.: ampola quebrada" />
            </div>
          </div>
        </ActionForm>
      )}

      <section className="card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Movimento</th>
              <th className="px-3 py-2">Lote</th>
              <th className="px-3 py-2">Qtd.</th>
              <th className="px-3 py-2">Detalhe</th>
              <th className="px-3 py-2">Quem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {movements.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(m.at)}</td>
                <td className="px-3 py-2">{movementLabel[m.kind]}</td>
                <td className="px-3 py-2">{m.lot}</td>
                <td className={`px-3 py-2 font-medium ${m.quantity > 0 ? "text-emerald-700" : "text-red-700"}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                <td className="px-3 py-2 text-slate-600">{[m.patient?.name, m.invoice && `NF ${m.invoice}`, m.note].filter(Boolean).join(" · ")}</td>
                <td className="px-3 py-2">{displayName(m.user)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
