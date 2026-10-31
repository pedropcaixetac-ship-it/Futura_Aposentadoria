import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { displayName } from "@/lib/staff";
import { durationLabel } from "@/lib/centro-cirurgico";
import { kitchenDate as todayDate } from "@/lib/cozinha";
import { ActionForm } from "../financeiro/action-form";
import { saveRoom } from "./actions";
import { SurgeryBadge } from "./status-badge";

const DAY = 24 * 3600_000;
const BRT = 3 * 3600_000;
const hour = (d: Date) => new Date(d.getTime() - BRT).toISOString().slice(11, 16);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Mapa cirúrgico do dia: uma coluna por sala, com as cirurgias na ordem do horário.
export default async function SurgicalMapPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const user = await requireUser("centro-cirurgico");
  const { data } = await searchParams;
  const day = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? new Date(`${data}T00:00:00Z`) : todayDate();
  const from = new Date(day.getTime() + BRT);
  const to = new Date(from.getTime() + DAY);
  const [rooms, surgeries] = await Promise.all([
    prisma.operatingRoom.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } }),
    prisma.surgery.findMany({
      where: { clinicId: user.clinicId, scheduledAt: { gte: from, lt: to } },
      include: { patient: { select: { name: true, socialName: true } }, surgeon: { select: { name: true, sex: true, jobTitle: true } }, admission: { select: { bed: { select: { code: true } } } } },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);
  const active = surgeries.filter((s) => s.status !== "CANCELADA");
  const label = day.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });
  const manageRooms = user.role === "ADMIN" || user.role === "ADMINISTRATIVO";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Centro cirúrgico</h1>
          <p className="text-sm text-slate-500">Mapa cirúrgico de {label}: {active.length} cirurgia(s), {active.filter((s) => s.status === "EM_SALA").length} em sala agora.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/centro-cirurgico?data=${isoDay(new Date(day.getTime() - DAY))}`} className="btn-secondary">← Dia anterior</Link>
          <Link href="/centro-cirurgico" className="btn-secondary">Hoje</Link>
          <Link href={`/centro-cirurgico?data=${isoDay(new Date(day.getTime() + DAY))}`} className="btn-secondary">Próximo dia →</Link>
          {rooms.length > 0 && <Link href="/centro-cirurgico/agendar" className="btn-primary">Agendar cirurgia</Link>}
        </div>
      </div>

      {rooms.length === 0 && <p className="card text-sm text-slate-600">Nenhuma sala cadastrada ainda.{manageRooms ? " Cadastre abaixo." : " Peça à administração para cadastrar as salas."}</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rooms.map((room) => {
          const list = surgeries.filter((s) => s.roomId === room.id);
          return (
            <section key={room.id} className="card space-y-2">
              <h2 className="flex items-center justify-between font-semibold text-marinho-800">
                {room.name}
                {list.some((s) => s.status === "EM_SALA") ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">Ocupada</span> : <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs text-white">Livre</span>}
              </h2>
              {list.length === 0 && <p className="text-sm text-slate-500">Sem cirurgias.</p>}
              <ul className="space-y-2">
                {list.map((s) => (
                  <li key={s.id}>
                    <Link href={`/centro-cirurgico/${s.id}`} className={`block rounded-md border border-slate-200 p-2 text-sm hover:shadow ${s.status === "CANCELADA" ? "opacity-50" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{hour(s.scheduledAt)} <span className="font-normal text-slate-500">· {durationLabel(s.expectedMinutes)}</span></span>
                        <SurgeryBadge status={s.status} />
                      </div>
                      <p className="font-medium text-marinho-900">{s.patient.socialName || s.patient.name}{s.admission && <span className="font-normal text-slate-500"> · leito {s.admission.bed.code}</span>}</p>
                      <p>{s.procedure}{s.laterality && ` (${s.laterality.toLowerCase()})`}</p>
                      <p className="text-xs text-slate-500">{displayName(s.surgeon)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {manageRooms && (
        <ActionForm action={saveRoom} submitLabel="Cadastrar sala" className="card flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="room-name">Nova sala</label>
            <input className="input" id="room-name" name="name" placeholder="Ex.: Sala 1" required />
          </div>
        </ActionForm>
      )}
    </div>
  );
}
