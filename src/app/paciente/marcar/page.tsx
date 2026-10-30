import Link from "next/link";
import { requirePatient } from "@/lib/patient-auth";
import { availableDays, bookableProfessionals } from "@/lib/patient-booking";
import { MAX_APP_BOOKINGS } from "@/lib/patient-app";
import { patientBook } from "../actions";
import { PatientHeader } from "../header";
import { longWhen, SlotPicker } from "../slot-picker";

const errors: Record<string, string> = {
  ocupado: "Esse horário acabou de ser ocupado. Escolha outro, por favor.",
  limite: `Você já tem ${MAX_APP_BOOKINGS} consultas marcadas pelo aplicativo. Para marcar mais, fale com a recepção.`,
};

export default async function PatientBookPage({
  searchParams,
}: {
  searchParams: Promise<{ profissional?: string; dia?: string; hora?: string; erro?: string }>;
}) {
  const patient = await requirePatient();
  const { profissional, dia, hora, erro } = await searchParams;
  const professionals = await bookableProfessionals(patient.clinicId);
  const professional = professionals.find((p) => p.id === profissional);

  return (
    <>
      <PatientHeader clinicName={patient.clinic.name} back />
      <div className="flex-1 space-y-4 bg-slate-50 px-4 py-5">
        <h1 className="text-xl font-semibold text-marinho-800">Marcar consulta</h1>
        {erro && errors[erro] && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errors[erro]}</p>}

        {!professional ? (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-marinho-800">Com quem?</h2>
            {professionals.length === 0 && <p className="card text-sm text-slate-500">A clínica ainda não abriu horários pelo aplicativo. Fale com a recepção.</p>}
            {professionals.map((p) => (
              <Link key={p.id} href={`/paciente/marcar?profissional=${p.id}`} className="card block hover:border-marinho-400">
                <span className="font-medium text-marinho-900">{p.name}</span>
                {p.specialty && <span className="block text-sm text-slate-500">{p.specialty}</span>}
              </Link>
            ))}
          </section>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-marinho-900">
                {professional.name}
                {professional.specialty && <span className="block text-sm font-normal text-slate-500">{professional.specialty}</span>}
              </p>
              <Link href="/paciente/marcar" className="text-sm text-marinho-700 underline">Trocar</Link>
            </div>
            <SlotPicker
              days={await availableDays(patient.clinicId, professional.id)}
              date={dia}
              start={hora}
              href={({ dia, hora }) => `/paciente/marcar?profissional=${professional.id}&dia=${dia}${hora ? `&hora=${encodeURIComponent(hora)}` : ""}`}
              confirm={(slot) => (
                <form action={patientBook.bind(null, professional.id, slot.start.toISOString())} className="space-y-3">
                  <p className="text-sm text-slate-600">
                    Consulta com <strong className="text-marinho-900">{professional.name}</strong>
                    <span className="block text-base font-semibold text-marinho-900">{longWhen(slot.start)}</span>
                  </p>
                  <button className="btn-primary w-full">Confirmar marcação</button>
                </form>
              )}
            />
          </>
        )}
      </div>
    </>
  );
}
