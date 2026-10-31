import { prisma } from "@/lib/db";
import { requirePlatformUser } from "@/lib/painel-auth";
import { formatMoney, moneyInput } from "@/lib/money";
import { MODULES } from "@/lib/plans";
import { ActionForm } from "@/app/(app)/financeiro/action-form";
import { savePlan } from "../actions";

type PlanFields = { name: string; priceCents: number; maxUsers: number | null; modules: string[]; active: boolean };

function PlanForm({ id, plan }: { id: string | null; plan?: PlanFields }) {
  return (
    <ActionForm action={savePlan.bind(null, id)} submitLabel={id ? "Salvar" : "Criar plano"} resetOnSuccess={!id} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Nome do plano</label>
          <input className="input" name="name" required defaultValue={plan?.name} placeholder="Ex.: Essencial" />
        </div>
        <div>
          <label className="label">Mensalidade (R$)</label>
          <input className="input" name="price" required inputMode="decimal" defaultValue={plan ? moneyInput(plan.priceCents) : ""} placeholder="199,90" />
        </div>
        <div>
          <label className="label">Máximo de usuários</label>
          <input className="input" name="maxUsers" inputMode="numeric" defaultValue={plan?.maxUsers ?? ""} placeholder="Vazio = sem limite" />
        </div>
      </div>
      <fieldset>
        <legend className="label">Módulos incluídos</legend>
        <p className="mb-2 text-xs text-slate-500">Agenda, pacientes, prontuário, recepção, servidores e auditoria fazem parte de todos os planos.</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {MODULES.map((m) => (
            <label key={m.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="modules" value={m.key} defaultChecked={plan ? plan.modules.includes(m.key) : true} />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={plan?.active ?? true} />
        Disponível para novas instituições
      </label>
    </ActionForm>
  );
}

export default async function PlansPage() {
  await requirePlatformUser();
  const plans = await prisma.plan.findMany({ include: { _count: { select: { clinics: true } } }, orderBy: { priceCents: "asc" } });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-marinho-800">Planos</h1>

      {plans.map((p) => (
        <section key={p.id} className="card space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-dourado-300 pb-2">
            <h2 className="font-semibold text-marinho-800">
              {p.name} {!p.active && <span className="text-xs font-normal text-slate-500">(não oferecido)</span>}
            </h2>
            <p className="text-sm text-slate-600">
              {formatMoney(p.priceCents)}/mês · {p.maxUsers ? `até ${p.maxUsers} usuários` : "usuários sem limite"} · {p._count.clinics} {p._count.clinics === 1 ? "instituição" : "instituições"}
            </p>
          </div>
          <PlanForm id={p.id} plan={p} />
        </section>
      ))}

      <section className="card space-y-3">
        <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">Novo plano</h2>
        <PlanForm id={null} />
      </section>
    </div>
  );
}
