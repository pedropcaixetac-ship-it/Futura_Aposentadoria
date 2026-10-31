import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePlatformUser } from "@/lib/painel-auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { billingLabel, billingStatus, clinicBlocked } from "@/lib/plans";

// Início do mês no horário de Brasília.
function monthStart() {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 3));
}

// Só números de uso (quantos usuários, pacientes, consultas). Nenhum dado de paciente
// nem do prontuário aparece aqui: a equipe da empresa não tem acesso a eles (LGPD).
export default async function ClinicsPage({ searchParams }: { searchParams: Promise<{ busca?: string; situacao?: string }> }) {
  await requirePlatformUser();
  const { busca = "", situacao = "" } = await searchParams;
  const since = monthStart();

  const [clinics, users, patients, appointments, logins] = await Promise.all([
    prisma.clinic.findMany({
      where: {
        ...(busca && { OR: [{ name: { contains: busca, mode: "insensitive" } }, { slug: { contains: busca.toLowerCase() } }] }),
        ...(situacao === "ativas" && { active: true }),
        ...(situacao === "suspensas" && { active: false }),
      },
      include: { plan: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.groupBy({ by: ["clinicId"], where: { active: true, systemAccess: true }, _count: true }),
    prisma.patient.groupBy({ by: ["clinicId"], _count: true }),
    prisma.appointment.groupBy({ by: ["clinicId"], where: { startsAt: { gte: since } }, _count: true }),
    prisma.auditLog.groupBy({ by: ["clinicId"], where: { action: "LOGIN" }, _max: { createdAt: true } }),
  ]);
  const count = (rows: { clinicId: string; _count: number }[], id: string) => rows.find((r) => r.clinicId === id)?._count ?? 0;
  const lastLogin = (id: string) => logins.find((r) => r.clinicId === id)?._max.createdAt ?? null;

  const all = await prisma.clinic.groupBy({ by: ["active"], _count: true });
  const activeCount = all.find((r) => r.active)?._count ?? 0;
  const suspendedCount = all.find((r) => !r.active)?._count ?? 0;
  const newThisMonth = await prisma.clinic.count({ where: { createdAt: { gte: since } } });
  // Receita prevista: mensalidade das clínicas com plano e acesso liberado.
  const paying = await prisma.clinic.findMany({ where: { planId: { not: null } }, select: { active: true, paidUntil: true, plan: { select: { priceCents: true } } } });
  const monthlyRevenue = paying.filter((c) => !clinicBlocked(c)).reduce((sum, c) => sum + (c.plan?.priceCents ?? 0), 0);
  const lateCount = paying.filter((c) => c.active && ["atrasada", "bloqueada"].includes(billingStatus(c.paidUntil).kind)).length;
  const billingColor: Record<string, string> = { "sem-controle": "text-slate-500", "em-dia": "text-emerald-700", "vence-logo": "text-dourado-700", atrasada: "text-red-700", bloqueada: "text-red-700" };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-marinho-800">Instituições</h1>
        <Link href="/painel/clinicas/nova" className="btn-primary">Cadastrar instituição</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="card"><p className="text-sm text-slate-500">Instituições ativas</p><p className="text-2xl font-semibold text-marinho-800">{activeCount}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Suspensas</p><p className="text-2xl font-semibold text-red-700">{suspendedCount}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Novas neste mês</p><p className="text-2xl font-semibold text-dourado-700">{newThisMonth}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Receita mensal prevista</p><p className="text-2xl font-semibold text-marinho-800">{formatMoney(monthlyRevenue)}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Mensalidades atrasadas</p><p className="text-2xl font-semibold text-red-700">{lateCount}</p></div>
      </div>

      <form className="flex flex-wrap gap-2">
        <input className="input max-w-xs" name="busca" defaultValue={busca} placeholder="Nome ou código da instituição" />
        <select className="input max-w-[12rem]" name="situacao" defaultValue={situacao}>
          <option value="">Todas</option>
          <option value="ativas">Ativas</option>
          <option value="suspensas">Suspensas</option>
        </select>
        <button className="btn-secondary">Filtrar</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-marinho-50 text-left text-xs uppercase tracking-wide text-marinho-700">
            <tr>
              <th className="px-4 py-3">Instituição</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Situação</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Mensalidade</th>
              <th className="px-4 py-3 text-right">Usuários</th>
              <th className="px-4 py-3 text-right">Pacientes</th>
              <th className="px-4 py-3 text-right">Consultas no mês</th>
              <th className="px-4 py-3">Último acesso</th>
              <th className="px-4 py-3">Cliente desde</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clinics.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/painel/clinicas/${c.id}`} className="font-medium text-marinho-700 hover:underline">{c.name}</Link>
                  {c.kind === "HOSPITAL" && <span className="ml-2 rounded-full bg-marinho-100 px-2 py-0.5 text-xs text-marinho-800">Hospital</span>}
                  {c.contactName && <p className="text-xs text-slate-500">{c.contactName}</p>}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{c.slug}</td>
                <td className="px-4 py-3">
                  {c.active
                    ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Ativa</span>
                    : <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">Suspensa</span>}
                </td>
                <td className="px-4 py-3">{c.plan?.name ?? <span className="text-slate-400">Sem plano</span>}</td>
                <td className={`whitespace-nowrap px-4 py-3 ${billingColor[billingStatus(c.paidUntil).kind]}`}>{billingLabel(billingStatus(c.paidUntil))}</td>
                <td className="px-4 py-3 text-right">{count(users, c.id)}</td>
                <td className="px-4 py-3 text-right">{count(patients, c.id)}</td>
                <td className="px-4 py-3 text-right">{count(appointments, c.id)}</td>
                <td className="px-4 py-3">{lastLogin(c.id) ? formatDateTime(lastLogin(c.id)) : "Nunca"}</td>
                <td className="px-4 py-3">{formatDate(c.createdAt)}</td>
              </tr>
            ))}
            {clinics.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-500">Nenhuma instituição encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
