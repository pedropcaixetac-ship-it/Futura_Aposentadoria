import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ArrivalForm } from "./arrival-form";

export default async function ArrivalPage() {
  await requireUser("pronto-socorro");
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/pronto-socorro" className="text-sm text-marinho-700 hover:underline">← Painel do pronto-socorro</Link>
        <h1 className="mt-1 text-2xl font-semibold">Chegada no pronto-socorro</h1>
        <p className="text-sm text-slate-500">O paciente entra na fila da triagem. A enfermagem classifica o risco e ele passa para a fila do médico.</p>
      </div>
      <ArrivalForm />
    </div>
  );
}
