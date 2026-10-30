import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { activeHealthPlans } from "@/lib/convenios-data";
import { updatePatient } from "../../actions";
import { PatientForm } from "../../patient-form";

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("pacientes");
  const { id } = await params;
  const patient = await prisma.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!patient) notFound();
  const plans = await activeHealthPlans(user.clinicId, patient.healthPlanId);
  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold">{patient.registrationComplete ? "Editar cadastro" : "Completar cadastro"}</h1>
      <PatientForm action={updatePatient.bind(null, id)} patient={patient} plans={plans} submitLabel="Salvar alterações" />
    </div>
  );
}
