import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { age, formatCpf, formatDate, formatPhone } from "@/lib/format";

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser("pacientes");
  const { q = "" } = await searchParams;
  const term = q.trim();
  const digits = term.replace(/\D/g, "");

  const patients = await prisma.patient.findMany({
    omit: { photo: true },
    where: {
      clinicId: user.clinicId,
      ...(term && {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { socialName: { contains: term, mode: "insensitive" } },
          { insuranceNumber: { contains: term, mode: "insensitive" } },
          ...(digits
            ? [{ cpf: { contains: digits } }, { phone: { contains: digits } }, { landline: { contains: digits } }, { cns: { contains: digits } }]
            : []),
        ],
      }),
    },
    orderBy: { name: "asc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Pacientes</h1>
        <div className="flex gap-2">
          <Link href="/pacientes/novo?modo=rapido" className="btn-secondary">Cadastro rápido</Link>
          <Link href="/pacientes/novo" className="btn-primary">+ Novo paciente</Link>
        </div>
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={term} placeholder="Buscar por nome, CPF, telefone, carteirinha ou Cartão SUS" className="input max-w-md" />
        <button className="btn-secondary">Buscar</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Nascimento</th>
              <th className="px-4 py-2 font-medium">CPF</th>
              <th className="px-4 py-2 font-medium">Telefone</th>
              <th className="px-4 py-2 font-medium">Convênio</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-marinho-50/40">
                <td className="px-4 py-2">
                  <Link href={`/pacientes/${p.id}`} className="font-medium text-marinho-800 hover:underline">
                    {p.socialName || p.name}
                  </Link>
                  {!p.registrationComplete && (
                    <span className="ml-2 rounded-full bg-dourado-100 px-2 py-0.5 text-xs text-dourado-700">cadastro incompleto</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {formatDate(p.birthDate)} {p.birthDate && <span className="text-slate-400">({age(p.birthDate)} anos)</span>}
                </td>
                <td className="px-4 py-2">{formatCpf(p.cpf)}</td>
                <td className="px-4 py-2">{formatPhone(p.phone)}</td>
                <td className="px-4 py-2">{p.insurance}</td>
              </tr>
            ))}
            {patients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhum paciente encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
