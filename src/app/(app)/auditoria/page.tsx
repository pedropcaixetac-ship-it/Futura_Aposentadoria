import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { auditActionLabel } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ paciente?: string }> }) {
  const user = await requireUser("auditoria");
  const { paciente } = await searchParams;

  const logs = await prisma.auditLog.findMany({
    where: { clinicId: user.clinicId, ...(paciente && { patientId: paciente }) },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const patientIds = [...new Set(logs.map((l) => l.patientId).filter((id): id is string => !!id))];
  const patients = await prisma.patient.findMany({ where: { id: { in: patientIds }, clinicId: user.clinicId }, select: { id: true, name: true } });
  const patientName = new Map(patients.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="text-sm text-slate-500">
          Quem acessou ou alterou informações, e quando. Estes registros não podem ser apagados.
          {paciente && (
            <> Filtrando por {patientName.get(paciente) ?? "paciente"}. <Link href="/auditoria" className="text-marinho-700 hover:underline">Ver tudo</Link></>
          )}
        </p>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Quando</th>
              <th className="px-4 py-2 font-medium">Quem</th>
              <th className="px-4 py-2 font-medium">O quê</th>
              <th className="px-4 py-2 font-medium">Paciente</th>
              <th className="px-4 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-4 py-2">{formatDateTime(l.createdAt)}</td>
                <td className="px-4 py-2">{l.user ? displayName(l.user) : "—"}</td>
                <td className="px-4 py-2">{auditActionLabel[l.action] ?? l.action}</td>
                <td className="px-4 py-2">
                  {l.patientId && (
                    <Link href={`/auditoria?paciente=${l.patientId}`} className="text-marinho-700 hover:underline">
                      {patientName.get(l.patientId)}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-400">{l.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
