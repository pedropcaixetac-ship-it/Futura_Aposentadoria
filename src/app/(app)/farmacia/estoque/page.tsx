import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { UNITS } from "@/lib/farmacia";
import { ActionForm } from "../../financeiro/action-form";
import { receiveStock, saveProduct } from "../actions";
import { loadStock } from "../data";
import { PharmacyNav } from "../nav";

export default async function StockPage() {
  const user = await requireUser("farmacia");
  const stock = await loadStock(user.clinicId);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Farmácia</h1>
        <p className="text-sm text-slate-500">Saldo por produto. Clique no produto para ver os lotes, as movimentações e fazer ajuste ou baixa de perda.</p>
      </div>
      <PharmacyNav current="estoque" />

      <section className="card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Saldo</th>
              <th className="px-3 py-2">Mínimo</th>
              <th className="px-3 py-2">Próximo vencimento</th>
              <th className="px-3 py-2">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stock.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nenhum produto cadastrado.</td></tr>}
            {stock.map((s) => {
              const next = s.lots.find((l) => l.expiresAt && l.expiresAt.getTime() >= Date.now());
              return (
                <tr key={s.product.id}>
                  <td className="px-3 py-2">
                    <Link href={`/farmacia/estoque/${s.product.id}`} className="font-medium text-marinho-700 hover:underline">{s.product.name}</Link>
                    {s.product.presentation && <span className="text-slate-500"> {s.product.presentation}</span>}
                    {s.product.controlled && <span className="ml-2 rounded bg-red-50 px-1.5 text-xs text-red-700">controlado</span>}
                  </td>
                  <td className="px-3 py-2">{s.usable} {s.product.unit}(s)</td>
                  <td className="px-3 py-2">{s.product.minStock}</td>
                  <td className="px-3 py-2">{next?.expiresAt ? `${formatDate(next.expiresAt)} (lote ${next.lot})` : "—"}</td>
                  <td className="px-3 py-2">
                    {s.low && <span className="mr-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">abaixo do mínimo</span>}
                    {s.expired > 0 && <span className="mr-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">{s.expired} vencido(s)</span>}
                    {s.expiringSoon.length > 0 && <span className="mr-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">vence em 30 dias</span>}
                    {!s.low && !s.expired && !s.expiringSoon.length && <span className="text-xs text-emerald-700">ok</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ActionForm action={receiveStock} submitLabel="Dar entrada">
          <h2 className="font-semibold text-marinho-800">Entrada no estoque (nota fiscal)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="productId">Produto</label>
              <select className="input" id="productId" name="productId" defaultValue="" required>
                <option value="" disabled>Escolha</option>
                {stock.map((s) => <option key={s.product.id} value={s.product.id}>{s.product.name}{s.product.presentation && ` ${s.product.presentation}`}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="lot">Lote</label>
              <input className="input" id="lot" name="lot" required />
            </div>
            <div>
              <label className="label" htmlFor="expiresAt">Validade</label>
              <input className="input" id="expiresAt" name="expiresAt" type="date" required />
            </div>
            <div>
              <label className="label" htmlFor="quantity">Quantidade</label>
              <input className="input" id="quantity" name="quantity" type="number" min={1} required />
            </div>
            <div>
              <label className="label" htmlFor="invoice">Nota fiscal</label>
              <input className="input" id="invoice" name="invoice" />
            </div>
          </div>
        </ActionForm>

        <ActionForm action={saveProduct} submitLabel="Cadastrar produto">
          <h2 className="font-semibold text-marinho-800">Novo produto</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Nome</label>
              <input className="input" id="name" name="name" required placeholder="Ex.: Dipirona sódica" />
            </div>
            <div>
              <label className="label" htmlFor="presentation">Apresentação</label>
              <input className="input" id="presentation" name="presentation" placeholder="Ex.: 500 mg/mL ampola 2 mL" />
            </div>
            <div>
              <label className="label" htmlFor="unit">Unidade</label>
              <select className="input" id="unit" name="unit" defaultValue="unidade">
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="minStock">Estoque mínimo</label>
              <input className="input" id="minStock" name="minStock" type="number" min={0} defaultValue={0} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="controlled" /> Medicamento controlado (Portaria 344)
            </label>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
