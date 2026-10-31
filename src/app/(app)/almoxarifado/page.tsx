import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { deliverable, SUPPLY_CATEGORIES, SUPPLY_UNITS } from "@/lib/almoxarifado";
import { waitingLabel } from "@/lib/manutencao";
import { ActionForm } from "../financeiro/action-form";
import { cancelRequest, deliverRequest, receiveSupply, saveSupplyItem } from "./actions";
import { loadSupplyStock } from "./data";

export default async function SupplyPage() {
  const user = await requireUser("almoxarifado");
  const [stock, open] = await Promise.all([
    loadSupplyStock(user.clinicId),
    prisma.supplyRequest.findMany({
      where: { clinicId: user.clinicId, status: "ABERTA" },
      include: { lines: { include: { item: true } }, requestedBy: { select: { name: true, sex: true, jobTitle: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const balance = new Map(stock.map((s) => [s.item.id, s.balance]));
  const active = stock.filter((s) => s.item.active);
  const low = active.filter((s) => s.low);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Almoxarifado</h1>
        <p className="text-sm text-slate-500">Material de limpeza, escritório, rouparia e manutenção. Os medicamentos ficam na Farmácia.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-slate-500">Pedidos aguardando</p><p className="text-2xl font-semibold text-marinho-800">{open.length}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Itens cadastrados</p><p className="text-2xl font-semibold text-marinho-800">{active.length}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Abaixo do mínimo</p><p className={`text-2xl font-semibold ${low.length ? "text-red-700" : "text-emerald-700"}`}>{low.length}</p></div>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-marinho-800">Pedidos dos setores</h2>
        {open.length === 0 && <p className="card text-sm text-slate-500">Nenhum pedido aguardando.</p>}
        {open.map((r) => (
          <div key={r.id} className="card space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{r.sector} <span className="text-sm font-normal text-slate-500">· {displayName(r.requestedBy)} · {formatDateTime(r.createdAt)} ({waitingLabel(r.createdAt)})</span></p>
            </div>
            {r.note && <p className="text-sm text-slate-600">{r.note}</p>}
            <ActionForm action={deliverRequest.bind(null, r.id)} submitLabel="Registrar entrega" className="space-y-3">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr><th className="py-1">Item</th><th className="py-1">Pedido</th><th className="py-1">Saldo</th><th className="py-1">Entregar</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.lines.map((l) => {
                    const saldo = balance.get(l.itemId) ?? 0;
                    return (
                      <tr key={l.id}>
                        <td className="py-1.5">{l.item.name}</td>
                        <td className="py-1.5">{l.quantity} {l.item.unit}(s)</td>
                        <td className={`py-1.5 ${saldo < l.quantity ? "font-medium text-red-700" : ""}`}>{saldo}</td>
                        <td className="py-1.5">
                          <input className="input w-24!" type="number" min={0} max={l.quantity} name={`entregue_${l.id}`} defaultValue={deliverable(l.quantity, saldo)} aria-label={`Entregar ${l.item.name}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <input className="input" name="handledNote" placeholder="Observação da entrega (opcional)" aria-label="Observação da entrega" />
            </ActionForm>
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-500">Cancelar o pedido</summary>
              <ActionForm action={cancelRequest.bind(null, r.id)} submitLabel="Cancelar pedido" className="mt-2 flex flex-wrap items-end gap-2">
                <input className="input w-auto!" name="reason" placeholder="Motivo" required aria-label="Motivo do cancelamento" />
              </ActionForm>
            </details>
          </div>
        ))}
      </section>

      <section className="card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Saldo</th>
              <th className="px-3 py-2">Mínimo</th>
              <th className="px-3 py-2">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stock.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nenhum item cadastrado.</td></tr>}
            {stock.map((s) => (
              <tr key={s.item.id} className={s.item.active ? "" : "text-slate-400"}>
                <td className="px-3 py-2"><Link href={`/almoxarifado/${s.item.id}`} className="font-medium text-marinho-700 hover:underline">{s.item.name}</Link></td>
                <td className="px-3 py-2">{s.item.category}</td>
                <td className="px-3 py-2">{s.balance} {s.item.unit}(s)</td>
                <td className="px-3 py-2">{s.item.minStock}</td>
                <td className="px-3 py-2">
                  {!s.item.active ? "desativado" : s.low ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">comprar</span> : <span className="text-xs text-emerald-700">ok</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ActionForm action={receiveSupply} submitLabel="Dar entrada">
          <h2 className="font-semibold text-marinho-800">Entrada (chegou material)</h2>
          <div>
            <label className="label" htmlFor="itemId">Item</label>
            <select className="input" id="itemId" name="itemId" required defaultValue="">
              <option value="" disabled>Escolha</option>
              {active.map((s) => <option key={s.item.id} value={s.item.id}>{s.item.name} ({s.item.unit})</option>)}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="quantity">Quantidade</label>
              <input className="input" id="quantity" name="quantity" type="number" min={1} required />
            </div>
            <div>
              <label className="label" htmlFor="invoice">Nota fiscal</label>
              <input className="input" id="invoice" name="invoice" />
            </div>
            <div>
              <label className="label" htmlFor="enote">Observação</label>
              <input className="input" id="enote" name="note" />
            </div>
          </div>
        </ActionForm>

        <ActionForm action={saveSupplyItem} submitLabel="Cadastrar item">
          <h2 className="font-semibold text-marinho-800">Novo item</h2>
          <div>
            <label className="label" htmlFor="name">Nome</label>
            <input className="input" id="name" name="name" required placeholder="Ex.: Álcool 70% 1 L" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="category">Categoria</label>
              <select className="input" id="category" name="category" required defaultValue="">
                <option value="" disabled>Escolha</option>
                {SUPPLY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="unit">Unidade</label>
              <select className="input" id="unit" name="unit" defaultValue="unidade">
                {SUPPLY_UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="minStock">Estoque mínimo</label>
              <input className="input" id="minStock" name="minStock" type="number" min={0} defaultValue={0} />
            </div>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
