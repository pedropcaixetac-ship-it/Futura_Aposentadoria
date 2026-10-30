import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canManageAgendaOf, canSeeAllAgendas } from "@/lib/permissions";
import { addDays, clinicParts, formatDayLabel, formatTime, isValidDate, startOfWeek, statusLabel, today, weekdayOf } from "@/lib/agenda";
import { columnFor, listProfessionals, loadAgenda } from "@/lib/agenda-data";
import { AgendaGrid, StatusLegend, type GridColumn } from "./agenda-grid";
import { AgendaToolbar } from "./agenda-toolbar";

type SearchParams = { data?: string; visao?: string; profissional?: string };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("agenda");
  const params = await searchParams;
  const todayDate = today();
  const date = isValidDate(params.data) ? params.data : todayDate;
  const view = params.visao === "semana" ? "semana" : "dia";

  const all = await listProfessionals(user.clinicId);
  const seeAll = canSeeAllAgendas(user);
  const visible = seeAll ? all : all.filter((p) => p.id === user.id);

  if (visible.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <p className="card text-sm text-slate-500">
          Nenhum profissional de saúde cadastrado. A agenda aparece para profissionais com registro em conselho (CRM, CRP...).
        </p>
      </div>
    );
  }

  // No dia, "Todos" mostra uma coluna por profissional. Na semana, um profissional por vez.
  const chosen = visible.find((p) => p.id === params.profissional);
  const professionals = chosen ? [chosen] : view === "semana" || !seeAll ? [visible[0]] : visible;
  const dates = view === "semana" ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i)) : [date];
  const data = await loadAgenda(user.clinicId, professionals.map((p) => p.id), dates[0], dates[dates.length - 1]);

  const columns: GridColumn[] =
    view === "semana"
      ? dates
          .map((d) => ({
            key: d,
            title: formatDayLabel(d),
            highlight: d === todayDate,
            date: d,
            professionalId: professionals[0].id,
            data: columnFor(data, professionals[0].id, d),
          }))
          // Sábado e domingo só aparecem se houver atendimento neles.
          .filter((c) => weekdayOf(c.date) % 6 !== 0 || c.data.periods.length + c.data.appointments.length + c.data.cancelled.length > 0)
      : professionals.map((p) => ({
          key: p.id,
          title: p.name,
          subtitle: p.specialty ?? undefined,
          date,
          professionalId: p.id,
          data: columnFor(data, p.id, date),
        }));

  const cancelled = columns.flatMap((c) => c.data.cancelled);
  const name = new Map(all.map((p) => [p.id, p.name]));
  const step = view === "semana" ? 7 : 1;
  const heading =
    view === "semana"
      ? `Semana de ${formatDayLabel(dates[0])} a ${formatDayLabel(dates[6])}${chosen || !seeAll ? "" : ` · ${professionals[0].name}`}`
      : formatDayLabel(date);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Agenda</h1>
          <p className="text-sm text-slate-500">{heading}{date === todayDate && view === "dia" ? " (hoje)" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/agenda/horarios" className="btn-secondary">Horários e bloqueios</Link>
          <Link
            href={`/agenda/novo?data=${date}${professionals.length === 1 ? `&profissional=${professionals[0].id}` : ""}`}
            className="btn-primary"
          >
            + Marcar consulta
          </Link>
        </div>
      </div>

      <AgendaToolbar
        date={date}
        view={view}
        professionalId={chosen?.id ?? (view === "semana" ? professionals[0].id : "")}
        professionals={visible}
        canChooseProfessional={seeAll}
        prevDate={addDays(date, -step)}
        nextDate={addDays(date, step)}
        todayDate={todayDate}
      />

      <AgendaGrid columns={columns} canCreate={(id) => canManageAgendaOf(user, id)} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <StatusLegend />
        <p className="text-xs text-slate-500">Clique num horário livre para marcar, ou numa consulta para ver os detalhes.</p>
      </div>

      {cancelled.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-slate-600">Desmarcados</h2>
          <ul className="space-y-1 text-sm">
            {cancelled.map((a) => (
              <li key={a.id}>
                <Link href={`/agenda/${a.id}`} className="text-slate-500 hover:underline">
                  {view === "semana" && `${formatDayLabel(clinicParts(a.startsAt).date)} · `}
                  {formatTime(a.startsAt)} {a.patient.socialName || a.patient.name} · {name.get(a.professionalId)} · {statusLabel[a.status]}
                  {a.cancelReason && ` (${a.cancelReason})`}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
