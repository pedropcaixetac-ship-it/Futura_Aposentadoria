import Link from "next/link";
import { patientLogout } from "./actions";

export function PatientHeader({ clinicName, back }: { clinicName: string; back?: boolean }) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 text-white">
      {back ? (
        <Link href="/paciente" className="text-sm text-marinho-100 hover:text-dourado-300">← Minhas consultas</Link>
      ) : (
        <span className="truncate font-semibold text-dourado-300">{clinicName}</span>
      )}
      <form action={patientLogout}>
        <button className="rounded-md px-2 py-1 text-sm text-marinho-100 hover:text-dourado-300">Sair</button>
      </form>
    </header>
  );
}
