import Link from "next/link";
import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, roleLabel } from "@/lib/format";
import { staffFunction } from "@/lib/staff";
import { reactivateStaff } from "./actions";
import { RowMenu } from "./row-menu";

type Filters = { q?: string; funcao?: string; setor?: string; situacao?: string };

export default async function StaffPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const user = await requireUser("servidores");
  const { q = "", funcao = "", setor = "", situacao = "ativos" } = await searchParams;
  const term = q.trim();
  const digits = term.replace(/\D/g, "");
  const clinicId = user.clinicId;

  // "funcao" pode ser um perfil (perfil:ADMIN) ou um cargo digitado no cadastro.
  const roleFilter = funcao.startsWith("perfil:") ? (funcao.slice(7) as Role) : null;
  const where: Prisma.UserWhereInput = {
    clinicId,
    ...(situacao === "ativos" && { active: true }),
    ...(situacao === "desligados" && { active: false }),
    ...(roleFilter && roleFilter in roleLabel && { role: roleFilter }),
    ...(funcao && !roleFilter && { jobTitle: funcao }),
    AND: [
      term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { email: { contains: term, mode: "insensitive" } },
              { councilNumber: { contains: term, mode: "insensitive" } },
              ...(digits ? [{ cpf: { contains: digits } }] : []),
            ],
          }
        : {},
      setor ? { OR: [{ sector: setor }, { specialty: setor }] } : {},
    ],
  };

  const [staff, all] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, role: true, jobTitle: true, sector: true, specialty: true,
        councilType: true, councilNumber: true, councilUf: true, systemAccess: true, active: true, terminatedAt: true, customTabs: true,
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.user.findMany({ where: { clinicId }, select: { jobTitle: true, sector: true, specialty: true } }),
  ]);

  const unique = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
  const jobTitles = unique(all.map((u) => u.jobTitle));
  const sectors = unique(all.flatMap((u) => [u.specialty, u.sector]));
  const filtered = term || funcao || setor || situacao !== "ativos";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cadastro de servidores</h1>
          <p className="text-sm text-slate-500">A equipe da clínica, o que cada pessoa acessa no sistema e os desligamentos.</p>
        </div>
        <Link href="/servidores/novo" className="btn-primary">+ Novo servidor</Link>
      </div>

      <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
        <div>
          <label className="label" htmlFor="q">Buscar</label>
          <input id="q" name="q" defaultValue={term} placeholder="Nome, e-mail, CPF ou conselho" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="funcao">Função</label>
          <select id="funcao" name="funcao" defaultValue={funcao} className="input">
            <option value="">Todas</option>
            <optgroup label="Perfil de acesso">
              {Object.entries(roleLabel).map(([role, label]) => (
                <option key={role} value={`perfil:${role}`}>{label}</option>
              ))}
            </optgroup>
            {jobTitles.length > 0 && (
              <optgroup label="Cargo">
                {jobTitles.map((t) => <option key={t} value={t}>{t}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="setor">Setor / especialidade</label>
          <select id="setor" name="setor" defaultValue={setor} className="input">
            <option value="">Todos</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="situacao">Situação</label>
          <select id="situacao" name="situacao" defaultValue={situacao} className="input">
            <option value="ativos">Ativos</option>
            <option value="desligados">Desligados</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary">Filtrar</button>
          {filtered && <Link href="/servidores" className="btn-secondary">Limpar</Link>}
        </div>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nome completo</th>
              <th className="px-4 py-2 font-medium">Função</th>
              <th className="px-4 py-2 font-medium">Setor / especialidade</th>
              <th className="px-4 py-2 font-medium">Situação</th>
              <th className="w-12 px-2 py-2"><span className="sr-only">Opções</span></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className={`border-t border-slate-100 ${s.active ? "" : "bg-slate-50/60 text-slate-500"}`}>
                <td className="px-4 py-2">
                  <p className={`font-medium ${s.active ? "text-marinho-800" : ""}`}>{s.name}</p>
                  <p className="text-xs text-slate-400">{s.systemAccess ? s.email : "Sem acesso ao sistema"}</p>
                </td>
                <td className="px-4 py-2">
                  <p>{staffFunction(s)}</p>
                  {s.councilNumber && (
                    <p className="text-xs text-slate-400">{s.councilType} {s.councilNumber}/{s.councilUf}</p>
                  )}
                </td>
                <td className="px-4 py-2">
                  {s.specialty && <p>{s.specialty}</p>}
                  {s.sector && <p className={s.specialty ? "text-xs text-slate-400" : ""}>{s.sector}</p>}
                  {!s.specialty && !s.sector && <span className="text-slate-300">—</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  {s.active ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Ativo</span>
                  ) : (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      Desligado{s.terminatedAt && ` em ${formatDate(s.terminatedAt)}`}
                    </span>
                  )}
                  {s.systemAccess && s.customTabs && s.role !== "ADMIN" && (
                    <span className="ml-1 rounded bg-dourado-100 px-2 py-0.5 text-xs text-dourado-700" title="Abas diferentes do padrão do perfil">
                      Acesso personalizado
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  <RowMenu id={s.id} name={s.name} active={s.active} systemAccess={s.systemAccess} isSelf={s.id === user.id} reactivate={reactivateStaff.bind(null, s.id)} />
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Ninguém encontrado com esses filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
