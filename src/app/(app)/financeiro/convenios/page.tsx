import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { ActionForm } from "../action-form";
import { createHealthPlan, updateClinicCnes } from "./actions";
import { PlanFields } from "./plan-fields";

export default async function HealthPlansPage() {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) notFound();
  const [plans, clinic] = await Promise.all([
    prisma.healthPlan.findMany({
      where: { clinicId: user.clinicId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { prices: { where: { active: true } } } } },
    }),
    prisma.clinic.findUniqueOrThrow({ where: { id: user.clinicId } }),
  ]);

  return (
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Convênios</h2>
          <p className="text-sm text-slate-500">
            Os planos de saúde com que a clínica trabalha e o preço combinado de cada procedimento.
            Estes dados vão nas guias enviadas para cobrança.
          </p>
        </div>
        <ul className="card divide-y divide-slate-100 p-0">
          {plans.map((plan) => (
            <li key={plan.id} className={plan.active ? "" : "bg-slate-50 text-slate-400"}>
              <Link href={`/financeiro/convenios/${plan.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-marinho-50">
                <span className="min-w-40 flex-1 font-medium">{plan.name}</span>
                <span className="text-sm text-slate-500">{plan.ansCode ? `ANS ${plan.ansCode}` : "sem registro ANS"}</span>
                <span className="text-sm text-slate-500">{plan._count.prices} procedimento(s)</span>
                {!plan.active && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">Fora de uso</span>}
              </Link>
            </li>
          ))}
          {plans.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">Nenhum convênio cadastrado.</li>}
        </ul>
        <ActionForm action={createHealthPlan} submitLabel="Cadastrar convênio">
          <h3 className="font-semibold">Novo convênio</h3>
          <PlanFields />
        </ActionForm>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Dados da clínica para os convênios</h2>
          <p className="text-sm text-slate-500">
            O CNES é o registro da clínica no Ministério da Saúde e aparece em todas as guias. O CNPJ fica em &quot;Preços e recibo&quot;.
          </p>
        </div>
        <ActionForm action={updateClinicCnes} submitLabel="Salvar CNES" resetOnSuccess={false}>
          <div>
            <label className="label" htmlFor="cnes">CNES</label>
            <input className="input" id="cnes" name="cnes" defaultValue={clinic.cnes ?? ""} inputMode="numeric" placeholder="7 números" />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
