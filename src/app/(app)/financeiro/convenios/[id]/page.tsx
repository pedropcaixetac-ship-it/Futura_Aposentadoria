import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { moneyInput } from "@/lib/money";
import { formatTussCode } from "@/lib/convenios";
import { ActionForm } from "../../action-form";
import { addPlanPrice, importPlanPrices, updateHealthPlan, updatePlanPrice } from "../actions";
import { PlanFields } from "../plan-fields";

export default async function HealthPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) notFound();
  const { id } = await params;
  const plan = await prisma.healthPlan.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { prices: { orderBy: [{ active: "desc" }, { tussCode: "asc" }] } },
  });
  if (!plan) notFound();

  return (
    <div className="space-y-5">
      <Link href="/financeiro/convenios" className="text-sm text-marinho-700 hover:underline">‹ Todos os convênios</Link>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Procedimentos e preços — {plan.name}</h2>
            <p className="text-sm text-slate-500">
              Cada procedimento é identificado pelo código TUSS, a tabela oficial da ANS que todos os convênios usam.
            </p>
          </div>
          <ul className="card divide-y divide-slate-100 p-0">
            {plan.prices.map((price) => (
              <li key={price.id} className={`px-4 py-3 ${price.active ? "" : "bg-slate-50 text-slate-400"}`}>
                <form action={updatePlanPrice.bind(null, plan.id, price.id)} className="flex flex-wrap items-center gap-3">
                  <span className="w-24 font-mono text-xs">{formatTussCode(price.tussCode)}</span>
                  <span className="min-w-32 flex-1">{price.description}</span>
                  <label className="flex items-center gap-1 text-sm">
                    R$
                    <input name="price" defaultValue={moneyInput(price.priceCents)} inputMode="decimal" className="input w-24!" aria-label={`Preço de ${price.description}`} />
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="active" defaultChecked={price.active} className="h-4 w-4 accent-marinho-700" /> Em uso
                  </label>
                  <button className="btn-secondary px-3! py-1!">Salvar</button>
                </form>
              </li>
            ))}
            {plan.prices.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">Nenhum procedimento cadastrado.</li>}
          </ul>

          <ActionForm action={addPlanPrice.bind(null, plan.id)} submitLabel="Adicionar procedimento">
            <h3 className="font-semibold">Novo procedimento</h3>
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr_1fr]">
              <div>
                <label className="label" htmlFor="tussCode">Código TUSS *</label>
                <input className="input" id="tussCode" name="tussCode" inputMode="numeric" placeholder="10101012" required />
              </div>
              <div>
                <label className="label" htmlFor="description">Descrição *</label>
                <input className="input" id="description" name="description" placeholder="Consulta em consultório" required />
              </div>
              <div>
                <label className="label" htmlFor="price">Valor (R$) *</label>
                <input className="input" id="price" name="price" inputMode="decimal" placeholder="0,00" required />
              </div>
            </div>
            <p className="text-xs text-slate-500">Se o código já estiver na lista, o preço e a descrição são atualizados.</p>
          </ActionForm>

          <ActionForm action={importPlanPrices.bind(null, plan.id)} submitLabel="Gravar lista">
            <h3 className="font-semibold">Colar vários de uma vez</h3>
            <p className="text-sm text-slate-500">
              Copie da planilha ou do contrato, um procedimento por linha: código, descrição e valor, separados por ponto e vírgula.
            </p>
            <textarea
              className="input font-mono text-sm"
              name="list"
              rows={5}
              placeholder={"10101012; Consulta em consultório; 150,00\n20101015; Eletrocardiograma; 45,00"}
              aria-label="Lista de procedimentos"
            />
          </ActionForm>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Dados do convênio</h2>
          <ActionForm action={updateHealthPlan.bind(null, plan.id)} submitLabel="Salvar dados" resetOnSuccess={false}>
            <PlanFields plan={plan} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={plan.active} className="h-4 w-4 accent-marinho-700" />
              Convênio em uso
            </label>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
