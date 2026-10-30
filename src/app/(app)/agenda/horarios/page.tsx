import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canSeeAllAgendas } from "@/lib/permissions";
import { clinicParts, formatDayLabel, formatTime, today } from "@/lib/agenda";
import { listProfessionals } from "@/lib/agenda-data";
import { createBlock, deleteBlock, saveWorkHours } from "../actions";
import { BlockForm, WorkHoursForm } from "./hours-forms";

function formatInstant(date: Date) {
  return `${formatDayLabel(clinicParts(date).date)} ${formatTime(date)}`;
}

export default async function WorkHoursPage({ searchParams }: { searchParams: Promise<{ profissional?: string }> }) {
  const user = await requireUser();
  const { profissional } = await searchParams;
  const all = await listProfessionals(user.clinicId);
  const professionals = canSeeAllAgendas(user) ? all : all.filter((p) => p.id === user.id);
  const professional = professionals.find((p) => p.id === profissional) ?? professionals[0];

  if (!professional) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Horários e bloqueios</h1>
        <p className="card text-sm text-slate-500">Nenhum profissional de saúde cadastrado.</p>
      </div>
    );
  }

  const [hours, blocks] = await Promise.all([
    prisma.workHours.findMany({ where: { clinicId: user.clinicId, professionalId: professional.id }, orderBy: { startMinute: "asc" } }),
    prisma.scheduleBlock.findMany({
      where: { clinicId: user.clinicId, professionalId: professional.id, endsAt: { gt: new Date() } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  const periods: Record<number, { startMinute: number; endMinute: number }[]> = {};
  for (const h of hours) (periods[h.weekday] ??= []).push({ startMinute: h.startMinute, endMinute: h.endMinute });

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Link href="/agenda" className="text-sm text-marinho-700 hover:underline">← Voltar à agenda</Link>
        <h1 className="mt-1 text-2xl font-semibold">Horários e bloqueios</h1>
        <p className="text-sm text-slate-500">Os dias e horários em que cada profissional atende, e os períodos em que não atende.</p>
      </div>

      {professionals.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {professionals.map((p) => (
            <Link
              key={p.id}
              href={`/agenda/horarios?profissional=${p.id}`}
              className={`rounded-full border px-3 py-1 text-sm ${p.id === professional.id ? "border-marinho-700 bg-marinho-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

      <WorkHoursForm
        key={professional.id}
        action={saveWorkHours.bind(null, professional.id)}
        periods={periods}
        slotMinutes={hours[0]?.slotMinutes ?? 30}
      />

      <div className="card space-y-4">
        <h2 className="font-semibold">Bloqueios</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                {formatInstant(b.startsAt)} até {formatInstant(b.endsAt)}
                {b.reason && <span className="text-slate-500"> · {b.reason}</span>}
              </span>
              <form action={deleteBlock.bind(null, b.id)}>
                <button className="text-slate-400 hover:text-red-600">Excluir</button>
              </form>
            </li>
          ))}
          {blocks.length === 0 && <li className="py-2 text-slate-400">Nenhum bloqueio futuro.</li>}
        </ul>
        <div className="border-t border-slate-100 pt-4">
          <BlockForm key={professional.id} action={createBlock.bind(null, professional.id)} today={today()} />
        </div>
      </div>
    </div>
  );
}
