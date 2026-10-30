import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createPatient } from "../actions";
import { PatientForm } from "../patient-form";

export default async function NewPatientPage({ searchParams }: { searchParams: Promise<{ modo?: string }> }) {
  await requireUser("pacientes");
  const quick = (await searchParams).modo === "rapido";
  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{quick ? "Cadastro rápido" : "Novo paciente"}</h1>
        <Link href={quick ? "/pacientes/novo" : "/pacientes/novo?modo=rapido"} className="text-sm text-marinho-700 hover:underline">
          {quick ? "Preencher a ficha completa" : "Usar o cadastro rápido"}
        </Link>
      </div>
      <PatientForm key={quick ? "rapido" : "completo"} action={createPatient} mode={quick ? "rapido" : "completo"} submitLabel="Cadastrar paciente" />
    </div>
  );
}
