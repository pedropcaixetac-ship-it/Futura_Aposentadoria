import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePatient } from "@/lib/patient-auth";
import { availableDays } from "@/lib/patient-booking";
import { patientCanCancel } from "@/lib/patient-app";
import { displayName } from "@/lib/staff";
import { patientReschedule } from "../../actions";
import { PatientHeader } from "../../header";
import { longWhen, SlotPicker } from "../../slot-picker";

export default async function PatientReschedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dia?: string; hora?: string; erro?: string }>;
}) {
  const patient = await requirePatient();
  const { id } = await params;
  const { dia, hora, erro } = await searchParams;
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId: patient.clinicId, patientId: patient.id },
    include: { professional: { select: { name: true, jobTitle: true, sex: true } } },
  });
  if (!appointment) notFound();
  if (!patientCanCancel(appointment)) redirect("/paciente");
  const professionalName = displayName(appointment.professional);

  return (
    <>
      <PatientHeader clinicName={patient.clinic.name} back />
      <div className="flex-1 space-y-4 bg-slate-50 px-4 py-5">
        <h1 className="text-xl font-semibold text-marinho-800">Remarcar consulta</h1>
        <p className="text-sm text-slate-600">
          Hoje marcada para <strong>{longWhen(appointment.startsAt)}</strong> com {professionalName}. Escolha o novo horário:
        </p>
        {erro === "ocupado" && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Esse horário acabou de ser ocupado. Escolha outro, por favor.</p>}
        <SlotPicker
          days={await availableDays(patient.clinicId, appointment.professionalId)}
          date={dia}
          start={hora}
          href={({ dia, hora }) => `/paciente/remarcar/${id}?dia=${dia}${hora ? `&hora=${encodeURIComponent(hora)}` : ""}`}
          confirm={(slot) => (
            <form action={patientReschedule.bind(null, id, slot.start.toISOString())} className="space-y-3">
              <p className="text-sm text-slate-600">
                Novo horário com <strong className="text-marinho-900">{professionalName}</strong>
                <span className="block text-base font-semibold text-marinho-900">{longWhen(slot.start)}</span>
              </p>
              <button className="btn-primary w-full">Confirmar novo horário</button>
            </form>
          )}
        />
      </div>
    </>
  );
}
