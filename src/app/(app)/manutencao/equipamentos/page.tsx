import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { HOSPITAL_SECTORS } from "@/lib/almoxarifado";
import { preventiveDue } from "@/lib/manutencao";
import { ActionForm } from "../../financeiro/action-form";
import { saveEquipment, setEquipmentActive } from "../actions";

const dueStyle = { VENCIDA: "font-medium text-red-700", VENCE_EM_BREVE: "text-amber-700", OK: "", SEM_PLANO: "text-slate-400" };

export default async function EquipmentPage() {
  const user = await requireUser("manutencao");
  const equipments = await prisma.equipment.findMany({
    where: { clinicId: user.clinicId },
    include: { workOrders: { where: { status: { in: ["ABERTO", "EM_ANDAMENTO"] } }, select: { stopped: true } } },
    orderBy: [{ active: "desc" }, { location: "asc" }, { name: "asc" }],
  });

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link href="/manutencao" className="text-sm text-marinho-700 hover:underline">← Manutenção</Link>
        <h1 className="mt-1 text-2xl font-semibold">Equipamentos</h1>
        <p className="text-sm text-slate-500">Patrimônio, onde fica e de quanto em quanto tempo faz preventiva.</p>
      </div>

      <section className="card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Equipamento</th>
              <th className="px-3 py-2">Patrimônio</th>
              <th className="px-3 py-2">Setor</th>
              <th className="px-3 py-2">Próxima preventiva</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {equipments.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Nenhum equipamento cadastrado.</td></tr>}
            {equipments.map((e) => {
              const { state, dueAt } = preventiveDue(e);
              const stopped = e.workOrders.some((w) => w.stopped);
              return (
                <tr key={e.id} className={e.active ? "" : "text-slate-400"}>
                  <td className="px-3 py-2">
                    <span className="font-medium">{e.name}</span>
                    {e.brandModel && <span className="text-slate-500"> · {e.brandModel}</span>}
                  </td>
                  <td className="px-3 py-2">{e.tag}</td>
                  <td className="px-3 py-2">{e.location}</td>
                  <td className={`px-3 py-2 ${dueStyle[state]}`}>{dueAt ? formatDate(dueAt) : "sem preventiva"}{e.preventiveDays && <span className="text-xs text-slate-500"> (a cada {e.preventiveDays} dias)</span>}</td>
                  <td className="px-3 py-2">
                    {!e.active ? "desativado" : stopped ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">parado</span> : e.workOrders.length ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">em manutenção</span> : <span className="text-xs text-emerald-700">funcionando</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <form action={setEquipmentActive.bind(null, e.id, !e.active)}>
                      <button className="text-xs text-marinho-700 hover:underline">{e.active ? "Desativar" : "Reativar"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <ActionForm action={saveEquipment} submitLabel="Cadastrar equipamento">
        <h2 className="font-semibold text-marinho-800">Novo equipamento</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="name">Nome</label>
            <input className="input" id="name" name="name" required placeholder="Ex.: Monitor multiparâmetro" />
          </div>
          <div>
            <label className="label" htmlFor="tag">Patrimônio</label>
            <input className="input" id="tag" name="tag" required placeholder="Ex.: PAT-0123" />
          </div>
          <div>
            <label className="label" htmlFor="location">Setor</label>
            <select className="input" id="location" name="location" required defaultValue="">
              <option value="" disabled>Escolha</option>
              {HOSPITAL_SECTORS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="brandModel">Marca e modelo</label>
            <input className="input" id="brandModel" name="brandModel" />
          </div>
          <div>
            <label className="label" htmlFor="serial">Número de série</label>
            <input className="input" id="serial" name="serial" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="preventiveDays">Preventiva a cada (dias)</label>
              <input className="input" id="preventiveDays" name="preventiveDays" type="number" min={1} placeholder="Ex.: 180" />
            </div>
            <div>
              <label className="label" htmlFor="lastPreventiveAt">Última preventiva</label>
              <input className="input" id="lastPreventiveAt" name="lastPreventiveAt" type="date" />
            </div>
          </div>
        </div>
      </ActionForm>
    </div>
  );
}
