import { requireUser } from "@/lib/auth";
import { createPatient } from "../actions";
import { PatientForm } from "../patient-form";

export default async function NewPatientPage() {
  await requireUser();
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Novo paciente</h1>
      <PatientForm action={createPatient} submitLabel="Cadastrar paciente" />
    </div>
  );
}
