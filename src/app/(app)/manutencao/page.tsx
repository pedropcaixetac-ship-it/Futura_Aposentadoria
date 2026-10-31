import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { preventiveDue, waitingLabel, workOrderOrder, workStatusLabel, workStatusStyle } from "@/lib/manutencao";
import { ActionForm } from "../financeiro/action-form";
import { cancelWorkOrder, closeWorkOrder, openPreventive, startWorkOrder } from "./actions";

export default async function MaintenancePage() {
  const user = await requireUser("manutencao");
  const [open, done, equipments] = await Promise.all([
    prisma.workOrder.findMany({
      where: { clinicId: user.clinicId, status: { in: ["ABERTO", "EM_ANDAMENTO"] } },
      include: { equipment: { select: { name: true, tag: true } }, openedBy: { select: { name: true, sex: true, jobTitle: true } } },
    }),
    prisma.workOrder.findMany({
      where: { clinicId: user.clinicId, status: { in: ["CONCLUIDO", "CANCELADO"] } },
      include: { equipment: { select: { name: true, tag: true } }, closedBy: { select: { name: true, sex: true, jobTitle: true } } },
      orderBy: { closedAt: "desc" },
      take: 10,
    }),
    prisma.equipment.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } }),
  ]);
  open.sort(workOrderOrder);
  const openPreventives = new Set(open.filter((o) => o.kind === "PREVENTIVA" && o.equipmentId).map((o) => o.equipmentId));
  const due = equipments
    .map((e) => ({ e, ...preventiveDue(e) }))
    .filter((x) => x.state === "VENCIDA" || x.state === "VENCE_EM_BREVE")
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Manutenção</h1>
          <p className="text-sm text-slate-500">Chamados dos setores, com urgentes e equipamentos parados primeiro, e preventivas dos equipamentos.</p>
        </div>
        <Link href="/manutencao/equipamentos" className="btn-secondary">Equipamentos</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card"><p className="text-sm text-slate-500">Chamados abertos</p><p className="text-2xl font-semibold text-marinho-800">{open.length}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Urgentes</p><p className={`text-2xl font-semibold ${open.some((o) => o.urgent) ? "text-red-700" : "text-marinho-800"}`}>{open.filter((o) => o.urgent).length}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Equipamentos parados</p><p className={`text-2xl font-semibold ${open.some((o) => o.stopped) ? "text-red-700" : "text-marinho-800"}`}>{open.filter((o) => o.stopped).length}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Preventivas vencidas</p><p className={`text-2xl font-semibold ${due.some((d) => d.state === "VENCIDA") ? "text-red-700" : "text-emerald-700"}`}>{due.filter((d) => d.state === "VENCIDA").length}</p></div>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-marinho-800">Fila de chamados</h2>
        {open.length === 0 && <p className="card text-sm text-slate-500">Nenhum chamado aberto.</p>}
        {open.map((o) => (
          <div key={o.id} className={`card space-y-2 ${o.urgent ? "border-red-300" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Nº {o.number}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${workStatusStyle[o.status]}`}>{workStatusLabel[o.status]}</span>
              {o.urgent && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">urgente</span>}
              {o.stopped && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">equipamento parado</span>}
              {o.kind === "PREVENTIVA" && <span className="rounded-full bg-marinho-100 px-2 py-0.5 text-xs text-marinho-800">preventiva</span>}
              <span className="text-sm text-slate-500">{o.category} · {o.location} · {waitingLabel(o.createdAt)}</span>
            </div>
            <p className="text-sm">{o.equipment && <strong>{o.equipment.name} ({o.equipment.tag}): </strong>}{o.description}</p>
            <p className="text-xs text-slate-500">Aberto por {displayName(o.openedBy)} em {formatDateTime(o.createdAt)}{o.assignedTo && ` · com ${o.assignedTo}`}</p>
            <div className="flex flex-wrap items-start gap-4">
              {o.status === "ABERTO" && (
                <ActionForm action={startWorkOrder.bind(null, o.id)} submitLabel="Iniciar" className="flex flex-wrap items-end gap-2">
                  <input className="input w-auto!" name="assignedTo" placeholder="Quem vai atender" required aria-label="Quem vai atender" />
                </ActionForm>
              )}
              <ActionForm action={closeWorkOrder.bind(null, o.id)} submitLabel="Concluir" className="flex flex-wrap items-end gap-2">
                <input className="input w-auto! min-w-64" name="solution" placeholder="O que foi feito" required aria-label="O que foi feito" />
              </ActionForm>
              <details className="text-sm">
                <summary className="cursor-pointer py-2 text-slate-500">Cancelar</summary>
                <ActionForm action={cancelWorkOrder.bind(null, o.id)} submitLabel="Cancelar chamado" className="mt-2 flex flex-wrap items-end gap-2">
                  <input className="input w-auto!" name="reason" placeholder="Motivo" required aria-label="Motivo do cancelamento" />
                </ActionForm>
              </details>
            </div>
          </div>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">Preventivas a fazer</h2>
        {due.length === 0 && <p className="text-sm text-slate-500">Nenhuma preventiva vencida ou vencendo nos próximos 7 dias.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {due.map(({ e, state, dueAt }) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <strong>{e.name}</strong> ({e.tag}) · {e.location} ·{" "}
                <span className={state === "VENCIDA" ? "font-medium text-red-700" : "text-amber-700"}>
                  {state === "VENCIDA" ? "venceu" : "vence"} em {formatDate(dueAt!)}
                </span>
              </span>
              {openPreventives.has(e.id) ? (
                <span className="text-xs text-slate-500">chamado aberto</span>
              ) : (
                <form action={openPreventive.bind(null, e.id)}><button className="btn-secondary">Abrir preventiva</button></form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">Encerrados recentemente</h2>
        {done.length === 0 && <p className="text-sm text-slate-500">Nenhum.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {done.map((o) => (
            <li key={o.id} className="py-2">
              <span className="font-medium">Nº {o.number}</span>{" "}
              <span className={`rounded-full px-2 py-0.5 text-xs ${workStatusStyle[o.status]}`}>{workStatusLabel[o.status]}</span>{" "}
              <span className="text-slate-500">{o.location} · {o.closedAt && formatDateTime(o.closedAt)}{o.closedBy && ` · ${displayName(o.closedBy)}`}</span>
              <p>{o.equipment && <strong>{o.equipment.name}: </strong>}{o.solution}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
