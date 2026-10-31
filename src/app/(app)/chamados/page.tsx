import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { HOSPITAL_SECTORS, supplyRequestStatusLabel } from "@/lib/almoxarifado";
import { WORK_CATEGORIES, workStatusLabel, workStatusStyle } from "@/lib/manutencao";
import { ActionForm } from "../financeiro/action-form";
import { cancelRequest, requestSupplies } from "../almoxarifado/actions";
import { openWorkOrder } from "../manutencao/actions";

const ROWS = 5;

const requestStyle: Record<string, string> = {
  ABERTA: "bg-amber-100 text-amber-800",
  ATENDIDA: "bg-emerald-100 text-emerald-800",
  CANCELADA: "bg-slate-200 text-slate-600",
};

// Qualquer setor: pedir material ao almoxarifado e abrir chamado de manutenção, e acompanhar.
export default async function RequestsPage() {
  const user = await requireUser("chamados");
  const mySector = user.sector && HOSPITAL_SECTORS.includes(user.sector) ? user.sector : "";
  const mine = { OR: [{ requestedById: user.id }, ...(mySector ? [{ sector: mySector }] : [])] };
  const [items, equipments, requests, orders] = await Promise.all([
    prisma.supplyItem.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } }),
    prisma.equipment.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } }),
    prisma.supplyRequest.findMany({
      where: { clinicId: user.clinicId, ...mine },
      include: { lines: { include: { item: { select: { name: true, unit: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.workOrder.findMany({
      where: { clinicId: user.clinicId, OR: [{ openedById: user.id }, ...(mySector ? [{ location: mySector }] : [])] },
      include: { equipment: { select: { name: true, tag: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pedidos e chamados</h1>
        <p className="text-sm text-slate-500">Peça material ao almoxarifado ou chame a manutenção. Aqui embaixo aparecem os seus pedidos{mySector && ` e os do setor ${mySector}`}.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ActionForm action={openWorkOrder} submitLabel="Abrir chamado">
          <h2 className="font-semibold text-marinho-800">Chamar a manutenção</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="category">Tipo do problema</label>
              <select className="input" id="category" name="category" required defaultValue="">
                <option value="" disabled>Escolha</option>
                {WORK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="location">Setor</label>
              <select className="input" id="location" name="location" required defaultValue={mySector}>
                <option value="" disabled>Escolha</option>
                {HOSPITAL_SECTORS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="equipmentId">Equipamento (se for um aparelho)</label>
            <select className="input" id="equipmentId" name="equipmentId" defaultValue="">
              <option value="">Nenhum</option>
              {equipments.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.tag} · {e.location}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="description">O que está acontecendo</label>
            <textarea className="input" id="description" name="description" rows={3} required placeholder="Ex.: torneira do posto de enfermagem pingando" />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="urgent" className="w-auto!" /> Urgente (risco ao paciente)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="stopped" className="w-auto!" /> O equipamento está parado</label>
          </div>
        </ActionForm>

        <ActionForm action={requestSupplies} submitLabel="Enviar pedido">
          <h2 className="font-semibold text-marinho-800">Pedir material ao almoxarifado</h2>
          <div>
            <label className="label" htmlFor="sector">Setor</label>
            <select className="input" id="sector" name="sector" required defaultValue={mySector}>
              <option value="" disabled>Escolha</option>
              {HOSPITAL_SECTORS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">O almoxarifado ainda não cadastrou itens.</p>
          ) : (
            <div className="space-y-2">
              {[...Array(ROWS).keys()].map((i) => (
                <div key={i} className="grid grid-cols-[1fr_6rem] gap-2">
                  <select className="input" name={`item${i}`} aria-label={`Item ${i + 1}`} defaultValue="">
                    <option value="">{i === 0 ? "Escolha o item" : "—"}</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
                  </select>
                  <input className="input" name={`quantidade${i}`} type="number" min={1} placeholder="Qtd." aria-label={`Quantidade ${i + 1}`} />
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="label" htmlFor="note">Observação</label>
            <input className="input" id="note" name="note" placeholder="Opcional" />
          </div>
        </ActionForm>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold text-marinho-800">Chamados</h2>
          {orders.length === 0 && <p className="text-sm text-slate-500">Nenhum chamado.</p>}
          <ul className="divide-y divide-slate-100 text-sm">
            {orders.map((o) => (
              <li key={o.id} className="space-y-1 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Nº {o.number}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${workStatusStyle[o.status]}`}>{workStatusLabel[o.status]}</span>
                  {o.urgent && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">urgente</span>}
                  <span className="text-slate-500">{o.location} · {formatDateTime(o.createdAt)}</span>
                </div>
                <p>{o.equipment && <strong>{o.equipment.name} ({o.equipment.tag}): </strong>}{o.description}</p>
                {o.assignedTo && o.status === "EM_ANDAMENTO" && <p className="text-xs text-slate-500">Com {o.assignedTo}</p>}
                {o.solution && <p className="text-xs text-slate-600">{o.solution}</p>}
              </li>
            ))}
          </ul>
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold text-marinho-800">Pedidos de material</h2>
          {requests.length === 0 && <p className="text-sm text-slate-500">Nenhum pedido.</p>}
          <ul className="divide-y divide-slate-100 text-sm">
            {requests.map((r) => (
              <li key={r.id} className="space-y-1 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${requestStyle[r.status]}`}>{supplyRequestStatusLabel[r.status]}</span>
                  <span className="text-slate-500">{r.sector} · {formatDateTime(r.createdAt)}</span>
                </div>
                <p>
                  {r.lines.map((l) => `${l.item.name}: ${l.delivered !== null ? `${l.delivered} de ${l.quantity}` : l.quantity} ${l.item.unit}(s)`).join(" · ")}
                </p>
                {r.handledNote && <p className="text-xs text-slate-600">{r.handledNote}</p>}
                {r.status === "ABERTA" && r.requestedById === user.id && (
                  <ActionForm action={cancelRequest.bind(null, r.id)} submitLabel="Desistir do pedido" className="flex flex-wrap items-end gap-2">
                    <input className="input w-auto! text-xs" name="reason" placeholder="Motivo" required aria-label="Motivo" />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
