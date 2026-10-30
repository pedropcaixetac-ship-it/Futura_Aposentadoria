import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canSeeAllAgendas } from "@/lib/permissions";
import { isValidDate, parseMinutes, today } from "@/lib/agenda";
import { listProfessionals } from "@/lib/agenda-data";
import { saveAppointment } from "../actions";
import { AppointmentForm } from "../appointment-form";

type SearchParams = { profissional?: string; data?: string; hora?: string; duracao?: string; paciente?: string };

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("agenda");
  const params = await searchParams;
  const all = await listProfessionals(user.clinicId);
  const professionals = canSeeAllAgendas(user) ? all : all.filter((p) => p.id === user.id);

  const professionalId = professionals.find((p) => p.id === params.profissional)?.id ?? (professionals.length === 1 ? professionals[0].id : "");
  const duration = Number(params.duracao);
  const patient = params.paciente
    ? await prisma.patient.findFirst({
        where: { id: params.paciente, clinicId: user.clinicId },
        select: { id: true, name: true, phone: true, insurance: true },
      })
    : null;

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href={`/agenda${params.data ? `?data=${params.data}` : ""}`} className="text-sm text-marinho-700 hover:underline">← Voltar à agenda</Link>
        <h1 className="mt-1 text-2xl font-semibold">Marcar consulta</h1>
      </div>
      <AppointmentForm
        action={saveAppointment.bind(null, null)}
        professionals={professionals}
        patient={patient}
        submitLabel="Marcar consulta"
        defaults={{
          professionalId,
          date: isValidDate(params.data) ? params.data : today(),
          time: params.hora && parseMinutes(params.hora) !== null ? params.hora : "",
          duration: Number.isInteger(duration) && duration >= 5 ? duration : 30,
          type: "CONSULTA",
          insurance: patient?.insurance && patient.insurance !== "Particular" ? patient.insurance : null,
          notes: null,
        }}
      />
    </div>
  );
}
