import Link from "next/link";
import { formatTime } from "@/lib/agenda";

type Day = { date: string; slots: { start: Date; end: Date }[] };

const dayLabel = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return { weekday: weekday[0].toUpperCase() + weekday.slice(1), day: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) };
};

export const longWhen = (d: Date) => {
  const text = d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return text[0].toUpperCase() + text.slice(1);
};

// Escolha de dia e horário livre. Tocar num horário abre a confirmação; nada é gravado antes disso.
export function SlotPicker({
  days,
  date,
  start,
  href,
  confirm,
}: {
  days: Day[];
  date: string | undefined;
  start: string | undefined;
  href: (params: { dia: string; hora?: string }) => string;
  confirm: (slot: { start: Date; end: Date }) => React.ReactNode;
}) {
  if (days.length === 0) {
    return <p className="card text-sm text-slate-500">Não há horários livres nos próximos dias. Fale com a recepção.</p>;
  }
  const day = days.find((d) => d.date === date) ?? days[0];
  const chosen = start ? day.slots.find((s) => s.start.toISOString() === start) : undefined;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-marinho-800">Escolha o dia</h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {days.map((d) => {
            const l = dayLabel(d.date);
            const active = d.date === day.date;
            return (
              <Link
                key={d.date}
                href={href({ dia: d.date })}
                scroll={false}
                className={`flex min-w-16 shrink-0 flex-col items-center rounded-lg border px-3 py-2 text-sm ${
                  active ? "border-marinho-700 bg-marinho-700 text-white" : "border-slate-300 bg-white text-marinho-900"
                }`}
              >
                <span className="text-xs">{l.weekday}</span>
                <span className="font-semibold">{l.day}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-marinho-800">Escolha o horário</h2>
        <div className="grid grid-cols-4 gap-2">
          {day.slots.map((s) => {
            const iso = s.start.toISOString();
            const active = iso === chosen?.start.toISOString();
            return (
              <Link
                key={iso}
                href={href({ dia: day.date, hora: iso })}
                scroll={false}
                className={`rounded-md border py-2 text-center text-sm font-medium ${
                  active ? "border-dourado-500 bg-dourado-500 text-marinho-950" : "border-slate-300 bg-white text-marinho-900"
                }`}
              >
                {formatTime(s.start)}
              </Link>
            );
          })}
        </div>
      </div>

      {chosen && <div className="card sticky bottom-3 border-t-4 border-t-dourado-500 shadow-lg">{confirm(chosen)}</div>}
    </div>
  );
}
