import Link from "next/link";
import { appointmentTypeLabel, clinicParts, formatMinutes, formatTime, layoutLanes, statusLabel, statusStyle } from "@/lib/agenda";
import type { AgendaColumn } from "@/lib/agenda-data";

// Altura de cada minuto na tela: 30 minutos ocupam 42 pixels.
const PX = 1.4;

export type GridColumn = {
  key: string;
  title: string;
  subtitle?: string;
  highlight?: boolean;
  date: string;
  professionalId: string;
  data: AgendaColumn;
};

// Faixa de horas mostrada: do primeiro ao último horário com atendimento, ou 7h às 19h.
export function visibleRange(columns: GridColumn[]) {
  let start = 7 * 60;
  let end = 19 * 60;
  for (const c of columns) {
    for (const p of c.data.periods) {
      start = Math.min(start, p.startMinute);
      end = Math.max(end, p.endMinute);
    }
    for (const a of c.data.appointments) {
      const s = clinicParts(a.startsAt);
      const e = clinicParts(a.endsAt);
      start = Math.min(start, s.date < c.date ? 0 : s.minutes);
      end = Math.max(end, e.date > c.date ? 24 * 60 : e.minutes);
    }
  }
  return { start: Math.floor(start / 60) * 60, end: Math.min(24 * 60, Math.ceil(end / 60) * 60) };
}

function position(date: string, startsAt: Date, endsAt: Date, range: { start: number; end: number }) {
  const s = clinicParts(startsAt);
  const e = clinicParts(endsAt);
  const from = Math.max(range.start, s.date < date ? 0 : s.minutes);
  const to = Math.min(range.end, e.date > date ? 24 * 60 : e.minutes);
  return { top: (from - range.start) * PX, height: Math.max(0, to - from) * PX };
}

export function AgendaGrid({ columns, canCreate }: { columns: GridColumn[]; canCreate: (professionalId: string) => boolean }) {
  const range = visibleRange(columns);
  const hours: number[] = [];
  for (let m = range.start; m < range.end; m += 60) hours.push(m);
  const height = (range.end - range.start) * PX;

  return (
    <div className="card overflow-x-auto p-0">
      <div className="flex min-w-fit">
        <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-slate-200 bg-white">
          <div className="h-12 border-b border-slate-200" />
          <div className="relative" style={{ height }}>
            {hours.map((m) => (
              <span key={m} className="absolute right-2 -translate-y-1/2 text-xs text-slate-400" style={{ top: (m - range.start) * PX }}>
                {m > range.start && formatMinutes(m)}
              </span>
            ))}
          </div>
        </div>

        {columns.map((col) => {
          const create = canCreate(col.professionalId);
          return (
            <div key={col.key} className="min-w-44 flex-1 border-r border-slate-200 last:border-r-0">
              <div className={`flex h-12 flex-col justify-center border-b border-slate-200 px-2 text-center ${col.highlight ? "bg-dourado-100" : "bg-slate-50"}`}>
                <p className="truncate text-sm font-semibold text-marinho-900">{col.title}</p>
                {col.subtitle && <p className="truncate text-xs text-slate-500">{col.subtitle}</p>}
              </div>
              <div className="relative bg-slate-100/70" style={{ height }}>
                {/* Períodos de atendimento ficam brancos; o resto do dia fica cinza. */}
                {col.data.periods.map((p) => (
                  <div
                    key={p.id}
                    className="absolute inset-x-0 bg-white"
                    style={{ top: (Math.max(p.startMinute, range.start) - range.start) * PX, height: (Math.min(p.endMinute, range.end) - Math.max(p.startMinute, range.start)) * PX }}
                  />
                ))}
                {hours.map((m) => (
                  <div key={m} className="absolute inset-x-0 border-t border-slate-200" style={{ top: (m - range.start) * PX }} />
                ))}

                {col.data.blocks.map((b) => (
                  <div
                    key={b.id}
                    className="absolute inset-x-1 overflow-hidden rounded bg-[repeating-linear-gradient(45deg,#e2e8f0_0,#e2e8f0_6px,#f1f5f9_6px,#f1f5f9_12px)] px-2 py-1 text-xs text-slate-500"
                    style={position(col.date, b.startsAt, b.endsAt, range)}
                  >
                    Bloqueado{b.reason ? `: ${b.reason}` : ""}
                  </div>
                ))}

                {create &&
                  col.data.free.map((slot) => {
                    const { minutes } = clinicParts(slot.start);
                    const duration = (slot.end.getTime() - slot.start.getTime()) / 60_000;
                    return (
                      <Link
                        key={slot.start.toISOString()}
                        href={`/agenda/novo?profissional=${col.professionalId}&data=${col.date}&hora=${formatMinutes(minutes)}&duracao=${duration}`}
                        className="group absolute inset-x-1 flex items-start rounded px-2 py-1 text-xs text-slate-300 hover:bg-dourado-100 hover:text-dourado-700"
                        style={position(col.date, slot.start, slot.end, range)}
                        title={`Marcar às ${formatMinutes(minutes)}`}
                      >
                        + {formatMinutes(minutes)} livre
                      </Link>
                    );
                  })}

                {layoutLanes(col.data.appointments).map(({ item: a, lane, lanes }) => {
                  const pos = position(col.date, a.startsAt, a.endsAt, range);
                  const compact = pos.height < 36;
                  return (
                    <Link
                      key={a.id}
                      href={`/agenda/${a.id}`}
                      className={`absolute z-10 overflow-hidden rounded border-l-4 px-2 text-xs shadow-sm hover:z-20 hover:shadow-md ${compact ? "py-0.5" : "py-1"} ${statusStyle[a.status]}`}
                      style={{ ...pos, left: `calc(${(lane / lanes) * 100}% + 4px)`, width: `calc(${100 / lanes}% - 8px)` }}
                      title={`${formatTime(a.startsAt)} ${a.patient.socialName || a.patient.name} · ${statusLabel[a.status]}`}
                    >
                      <p className="truncate font-semibold">
                        {formatTime(a.startsAt)} {a.patient.socialName || a.patient.name}
                      </p>
                      {!compact && (
                        <p className="truncate opacity-80">
                          {appointmentTypeLabel[a.type]} · {a.insurance ?? "Particular"} · {statusLabel[a.status]}
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {(Object.keys(statusLabel) as (keyof typeof statusLabel)[]).map((s) => (
        <span key={s} className={`rounded border-l-4 px-2 py-0.5 ${statusStyle[s]}`}>{statusLabel[s]}</span>
      ))}
    </div>
  );
}
