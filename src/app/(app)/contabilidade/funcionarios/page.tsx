import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { today } from "@/lib/finance";
import { hasTab } from "@/lib/tabs";
import { staffFunction } from "@/lib/staff";
import { employmentTypeLabel, laborAlerts } from "@/lib/accounting";
import { requireAccountingPage } from "../data";

// A lista é a mesma equipe do "Cadastro de servidores", com os dados de contrato ao lado.
export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string }> }) {
  const user = await requireAccountingPage();
  const { q = "", situacao = "ativos" } = await searchParams;
  const now = today();

  const people = await prisma.user.findMany({
    where: {
      clinicId: user.clinicId,
      ...(situacao === "ativos" && { terminatedAt: null }),
      ...(situacao === "desligados" && { terminatedAt: { not: null } }),
      ...(situacao === "sem-contrato" && { contract: null }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { jobTitle: { contains: q, mode: "insensitive" as const } },
          { sector: { contains: q, mode: "insensitive" as const } },
        ],
      }),
    },
    include: { contract: { include: { vacations: true } } },
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
              <option value="sem-contrato">Sem dados de contrato</option>
              <option value="todos">Todos</option>
            </select>
          </div>
          <button className="btn-secondary">Filtrar</button>
        </form>
        {hasTab(user, "servidores") ? (
          <Link href="/servidores/novo" className="btn-primary">+ Cadastrar pessoa</Link>
        ) : (
          <p className="max-w-xs text-xs text-slate-500">Pessoas novas são cadastradas pelo administrador em &quot;Cadastro de servidores&quot;.</p>
        )}
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
            {people.map((p) => {
              const c = p.contract;
              return (
                <tr key={p.id} className={`border-t border-slate-100 ${p.terminatedAt ? "text-slate-400" : ""}`}>
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/contabilidade/funcionarios/${p.id}`} className="text-marinho-800 hover:underline">{p.name}</Link>
                    {p.terminatedAt && <span className="block text-xs font-normal">Desligado em {formatDate(p.terminatedAt)}</span>}
                  </td>
                  <td className="px-4 py-2">
                    {staffFunction(p)}
                    {p.sector && <span className="block text-xs text-slate-500">{p.sector}</span>}
                  </td>
                  {c ? (
                    <>
                      <td className="px-4 py-2">{employmentTypeLabel[c.type].split(" (")[0]}</td>
                      <td className="whitespace-nowrap px-4 py-2">{formatDate(c.admissionDate)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">{formatMoney(c.salaryCents)}</td>
                      <td className="px-4 py-2 text-xs">
                        {laborAlerts({ ...c, terminatedAt: p.terminatedAt }, c.vacations, now).map((a, i) => (
                          <span key={i} className={`block ${a.tone === "red" ? "text-red-700" : "text-dourado-700"}`}>{a.text}</span>
                        ))}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="px-4 py-2 text-xs">
                      <Link href={`/contabilidade/funcionarios/${p.id}`} className="text-marinho-700 hover:underline">
                        + Preencher dados de contrato
                      </Link>
                      <span className="text-slate-400"> (deixe vazio para quem não é funcionário, ex.: sócio ou profissional parceiro)</span>
                    </td>
                  )}
                </tr>
              );
            })}
            {people.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Ninguém encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
