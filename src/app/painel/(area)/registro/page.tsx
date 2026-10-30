import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePlatformUser } from "@/lib/painel-auth";
import { formatDateTime } from "@/lib/format";
import { platformActionLabel } from "@/lib/painel";

// Tudo o que a equipe da empresa fez no painel. Não pode ser apagado (prestação de contas da LGPD).
export default async function PlatformLogPage() {
  await requirePlatformUser();
  const logs = await prisma.platformAuditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const clinicIds = [...new Set(logs.map((l) => l.clinicId).filter((id): id is string => !!id))];
  const clinics = await prisma.clinic.findMany({ where: { id: { in: clinicIds } }, select: { id: true, name: true } });
  const clinicName = (id: string | null) => clinics.find((c) => c.id === id)?.name;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-marinho-800">Registro de ações da empresa</h1>
      <p className="text-sm text-slate-500">As últimas 200 ações. Estes registros não podem ser alterados nem apagados.</p>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-marinho-50 text-left text-xs uppercase tracking-wide text-marinho-700">
            <tr>
              <th className="px-4 py-3">Quando</th>
              <th className="px-4 py-3">Quem</th>
              <th className="px-4 py-3">O quê</th>
              <th className="px-4 py-3">Clínica</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-4 py-2">{formatDateTime(l.createdAt)}</td>
                <td className="px-4 py-2">{l.user?.name ?? "—"}</td>
                <td className="px-4 py-2">{platformActionLabel[l.action] ?? l.action}</td>
                <td className="px-4 py-2">
                  {l.clinicId ? <Link href={`/painel/clinicas/${l.clinicId}`} className="text-marinho-700 hover:underline">{clinicName(l.clinicId) ?? "—"}</Link> : "—"}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{l.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
