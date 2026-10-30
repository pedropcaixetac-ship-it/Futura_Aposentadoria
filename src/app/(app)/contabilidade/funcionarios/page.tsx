import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { today } from "@/lib/finance";
import { employmentTypeLabel, laborAlerts } from "@/lib/accounting";
import { requireAccountingPage } from "../data";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string }> }) {
  const user = await requireAccountingPage();
  const { q = "", situacao = "ativos" } = await searchParams;
  const now = today();

  const employees = await prisma.employee.findMany({
    where: {
      clinicId: user.clinicId,
      ...(situacao === "ativos" && { terminatedAt: null }),
      ...(situacao === "desligados" && { terminatedAt: { not: null } }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { jobTitle: { contains: q, mode: "insensitive" as const } },
          { sector: { contains: q, mode: "insensitive" as const } },
        ],
      }),
    },
    include: { vacations: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="q">Buscar</label>
            <input className="input" id="q" name="q" defaultValue={q} placeholder="Nome, função ou setor" />
          </div>
          <div>
            <label className="label" htmlFor="situacao">Situação</label>
            <select className="input" id="situacao" name="situacao" defaultValue={situacao}>
              <option value="ativos">Ativos</option>
              <option value="desligados">Desligados</option>
              <option value="todos">Todos</option>
            </select>
          </div>
          <button className="btn-secondary">Filtrar</button>
        </form>
        <Link href="/contabilidade/funcionarios/novo" className="btn-primary">+ Novo funcionário</Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Função / setor</th>
              <th className="px-4 py-2 font-medium">Vínculo</th>
              <th className="px-4 py-2 font-medium">Admissão</th>
              <th className="px-4 py-2 text-right font-medium">Salário</th>
              <th className="px-4 py-2 font-medium">Avisos</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className={`border-t border-slate-100 ${e.terminatedAt ? "text-slate-400" : ""}`}>
                <td className="px-4 py-2 font-medium">
                  <Link href={`/contabilidade/funcionarios/${e.id}`} className="text-marinho-800 hover:underline">{e.name}</Link>
                  {e.terminatedAt && <span className="block text-xs font-normal">Desligado em {formatDate(e.terminatedAt)}</span>}
                </td>
                <td className="px-4 py-2">
                  {e.jobTitle}
                  {e.sector && <span className="block text-xs text-slate-500">{e.sector}</span>}
                </td>
                <td className="px-4 py-2">{employmentTypeLabel[e.type].split(" (")[0]}</td>
                <td className="whitespace-nowrap px-4 py-2">{formatDate(e.admissionDate)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">{formatMoney(e.salaryCents)}</td>
                <td className="px-4 py-2 text-xs">
                  {laborAlerts(e, e.vacations, now).map((a, i) => (
                    <span key={i} className={`block ${a.tone === "red" ? "text-red-700" : "text-dourado-700"}`}>{a.text}</span>
                  ))}
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhum funcionário encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
