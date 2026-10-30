import { redirect } from "next/navigation";
import { getCurrentPatient } from "@/lib/patient-auth";
import { PatientLoginForm } from "./form";

export default async function PatientLoginPage() {
  if (await getCurrentPatient()) redirect("/paciente");
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="card w-full max-w-sm border-t-4 border-t-dourado-500">
        <h1 className="text-xl font-semibold text-marinho-800">Minhas consultas</h1>
        <p className="mb-6 text-sm text-slate-500">Veja as consultas marcadas na sua clínica</p>
        <PatientLoginForm />
      </div>
    </div>
  );
}
