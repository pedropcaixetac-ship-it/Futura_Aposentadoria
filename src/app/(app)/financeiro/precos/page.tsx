import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { moneyInput } from "@/lib/money";
import { createPriceItem, updateClinicInfo, updatePriceItem } from "../actions";
import { ActionForm } from "../action-form";

export default async function PricesPage() {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) notFound();
  const [items, clinic] = await Promise.all([
    prisma.priceItem.findMany({ where: { clinicId: user.clinicId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.clinic.findUniqueOrThrow({ where: { id: user.clinicId } }),
  ]);

  return (
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Tabela de preços</h2>
          <p className="text-sm text-slate-500">Ao lançar uma cobrança, o valor já vem preenchido a partir desta tabela.</p>
        </div>
        <ul className="card divide-y divide-slate-100 p-0">
          {items.map((item) => (
            <li key={item.id} className={`px-4 py-3 ${item.active ? "" : "bg-slate-50 text-slate-400"}`}>
              <form action={updatePriceItem.bind(null, item.id)} className="flex flex-wrap items-center gap-3">
                <span className="min-w-40 flex-1 font-medium">{item.name}</span>
                <label className="flex items-center gap-1 text-sm">
                  R$
                  <input name="price" defaultValue={moneyInput(item.priceCents)} inputMode="decimal" className="input w-28!" aria-label={`Preço de ${item.name}`} />
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="active" defaultChecked={item.active} className="h-4 w-4 accent-marinho-700" /> Em uso
                </label>
                <button className="btn-secondary px-3! py-1!">Salvar</button>
              </form>
            </li>
          ))}
          {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">Nenhum preço cadastrado.</li>}
        </ul>
        <ActionForm action={createPriceItem} submitLabel="Adicionar à tabela">
          <h3 className="font-semibold">Novo item</h3>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className="label" htmlFor="name">Consulta ou procedimento *</label>
              <input className="input" id="name" name="name" placeholder="Ex.: Consulta clínica geral" required />
            </div>
            <div>
              <label className="label" htmlFor="price">Valor (R$) *</label>
              <input className="input" id="price" name="price" inputMode="decimal" placeholder="0,00" required />
            </div>
          </div>
        </ActionForm>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Dados do recibo</h2>
          <p className="text-sm text-slate-500">Aparecem no topo de cada recibo. Para o paciente usar no Imposto de Renda, informe o CNPJ.</p>
        </div>
        <ActionForm action={updateClinicInfo} submitLabel="Salvar dados" resetOnSuccess={false}>
          <div>
            <label className="label">Nome da clínica</label>
            <input className="input bg-slate-50" value={clinic.name} disabled />
          </div>
          <div>
            <label className="label" htmlFor="cnpj">CNPJ</label>
            <input className="input" id="cnpj" name="cnpj" defaultValue={clinic.cnpj ?? ""} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <label className="label" htmlFor="address">Endereço (termine com a cidade)</label>
            <input className="input" id="address" name="address" defaultValue={clinic.address ?? ""} placeholder="Rua Exemplo, 100, Centro - Goiânia" />
          </div>
          <div>
            <label className="label" htmlFor="phone">Telefone</label>
            <input className="input" id="phone" name="phone" defaultValue={clinic.phone ?? ""} />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
