import { prisma } from "@/lib/db";
import { requirePatient } from "@/lib/patient-auth";
import { appointmentTypeLabel, statusLabel } from "@/lib/agenda";
import { displayName } from "@/lib/staff";
import { teleconsultationState } from "@/lib/teleconsulta";
import { patientLogout } from "./actions";

const when = (d: Date) => {
  const text = d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return text[0].toUpperCase() + text.slice(1);
};

// Tela inicial do aplicativo do paciente: só consultas, nada do prontuário.
export default async function PatientHomePage() {
  const patient = await requirePatient();
  const now = new Date();
  const select = {
    id: true,
    startsAt: true,
    type: true,
    status: true,
    professional: { select: { name: true, jobTitle: true, sex: true } },
    teleconsultation: { select: { token: true, endedAt: true, expiresAt: true, consentAt: true } },
  } as const;
  const [upcoming, past] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId: patient.clinicId, patientId: patient.id, endsAt: { gte: now }, status: { not: "DESMARCADO" } },
      select,
      orderBy: { startsAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: { clinicId: patient.clinicId, patientId: patient.id, endsAt: { lt: now }, status: { not: "DESMARCADO" } },
      select,
      orderBy: { startsAt: "desc" },
      take: 10,
    }),
  ]);
  const firstName = (patient.socialName || patient.name).trim().split(/\s+/)[0];

  return (
    <>
      <header className="flex items-center justify-between px-4 py-3 text-white">
        <span className="truncate font-semibold text-dourado-300">{patient.clinic.name}</span>
        <form action={patientLogout}>
          <button className="rounded-md px-2 py-1 text-sm text-marinho-100 hover:text-dourado-300">Sair</button>
        </form>
      </header>
      <div className="flex-1 space-y-4 bg-slate-50 px-4 py-5">
        <h1 className="text-xl font-semibold text-marinho-800">Olá, {firstName}!</h1>

        <section className="space-y-3">
          <h2 className="font-semibold text-marinho-800">Próximas consultas</h2>
          {upcoming.length === 0 && <p className="card text-sm text-slate-500">Nenhuma consulta marcada. Para marcar, fale com a recepção.</p>}
          {upcoming.map((a) => {
            const tele = a.teleconsultation && teleconsultationState(a.teleconsultation, now);
            return (
              <div key={a.id} className="card border-l-4 border-l-dourado-500">
                <p className="font-medium">{when(a.startsAt)}</p>
                <p className="text-sm text-slate-600">
                  {appointmentTypeLabel[a.type]} com {displayName(a.professional)}
                </p>
                <p className="mt-1 text-xs text-slate-500">{statusLabel[a.status]}</p>
                {a.teleconsultation && (tele === "AGUARDANDO_TERMO" || tele === "LIBERADA") && (
                  <a href={`/teleconsulta/${a.teleconsultation.token}`} className="btn-primary mt-3 w-full">
                    Entrar na teleconsulta
                  </a>
                )}
              </div>
            );
          })}
        </section>

        {past.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold text-marinho-800">Consultas anteriores</h2>
            <ul className="card divide-y divide-slate-100 p-0!">
              {past.map((a) => (
                <li key={a.id} className="px-4 py-2 text-sm">
                  <span>{when(a.startsAt)}</span>
                  <span className="block text-slate-500">
                    {appointmentTypeLabel[a.type]} com {displayName(a.professional)} · {statusLabel[a.status]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
