import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { auditActionLabel } from "@/lib/audit";
import { formatDateTime, onlyDigits } from "@/lib/format";
import { displayName } from "@/lib/staff";

const PAGE_SIZE = 100;

type Filters = { de?: string; ate?: string; usuario?: string; paciente?: string; busca?: string; acao?: string; pagina?: string };

// Datas do filtro chegam como "2026-10-30" e valem o dia inteiro no horário de Brasília.
function dayStart(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00-03:00`) : undefined;
}
function dayEnd(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59.999-03:00`) : undefined;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const user = await requireUser("auditoria");
  const filters = await searchParams;
  const { de = "", ate = "", usuario = "", paciente = "", busca = "", acao = "" } = filters;
  const page = Math.max(1, Number(filters.pagina) || 1);

  // Busca de paciente por nome ou CPF: vira a lista de pacientes que combinam.
  const term = busca.trim();
  const digits = onlyDigits(term);
  const matched = term
    ? await prisma.patient.findMany({
        where: {
          clinicId: user.clinicId,
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { socialName: { contains: term, mode: "insensitive" } },
            ...(digits.length >= 3 ? [{ cpf: { contains: digits } }] : []),
          ],
        },
        select: { id: true },
        take: 500,
      })
    : null;

  const where: Prisma.AuditLogWhereInput = {
    clinicId: user.clinicId,
    ...((de || ate) && { createdAt: { gte: dayStart(de), lte: dayEnd(ate) } }),
    ...(usuario && { userId: usuario }),
    ...(acao && { action: acao }),
    ...(paciente ? { patientId: paciente } : matched && { patientId: { in: matched.map((p) => p.id) } }),
  };

  const [logs, total, users, selectedPatient] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" } }),
    paciente ? prisma.patient.findFirst({ where: { id: paciente, clinicId: user.clinicId }, select: { name: true } }) : null,
  ]);
  const patientIds = [...new Set(logs.map((l) => l.patientId).filter((id): id is string => !!id))];
  const patients = await prisma.patient.findMany({ where: { id: { in: patientIds }, clinicId: user.clinicId }, select: { id: true, name: true } });
  const patientName = new Map(patients.map((p) => [p.id, p.name]));

  const actions = Object.entries(auditActionLabel).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!(de || ate || usuario || paciente || term || acao);

  // Monta o endereço mantendo os filtros atuais e trocando só o que for pedido.
  const href = (change: Partial<Filters>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...change })) if (value) params.set(key, value);
    const qs = params.toString();
    return qs ? `/auditoria?${qs}` : "/auditoria";
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="text-sm text-slate-500">
          Quem acessou ou alterou informações, e quando. Estes registros não podem ser apagados.
        </p>
      </div>

      {/* A chave recria o formulário a cada busca, para "Limpar filtros" esvaziar os campos de verdade. */}
      <form key={href({})} className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr_1fr_1fr] lg:items-end">
        <div>
          <label className="label" htmlFor="de">De</label>
          <input id="de" name="de" type="date" defaultValue={de} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="ate">Até</label>
          <input id="ate" name="ate" type="date" defaultValue={ate} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="usuario">Quem</label>
          <select id="usuario" name="usuario" defaultValue={usuario} className="input">
            <option value="">Todos</option>
            {users.map((u) => <option key={u.id} value={u.id}>{displayName(u)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="busca">Paciente</label>
          {paciente ? (
            <p className="input flex items-center justify-between gap-2 bg-slate-50">
              <span className="truncate">{selectedPatient?.name ?? "Paciente"}</span>
              <Link href={href({ paciente: undefined, pagina: undefined })} className="text-xs text-marinho-700 hover:underline">trocar</Link>
              <input type="hidden" name="paciente" value={paciente} />
            </p>
          ) : (
            <input id="busca" name="busca" defaultValue={term} placeholder="Nome ou CPF" className="input" />
          )}
        </div>
        <div>
          <label className="label" htmlFor="acao">O quê</label>
          <select id="acao" name="acao" defaultValue={acao} className="input">
            <option value="">Todas as ações</option>
            {actions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-5">
          <button className="btn-primary">Filtrar</button>
          {filtered && <Link href="/auditoria" className="text-sm text-marinho-700 hover:underline">Limpar filtros</Link>}
          <span className="ml-auto text-sm text-slate-500">
            {total === 0 ? "Nenhum registro" : `${total.toLocaleString("pt-BR")} ${total === 1 ? "registro" : "registros"}`}
          </span>
        </div>
      </form>

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
                    <Link href={href({ paciente: l.patientId, busca: undefined, pagina: undefined })} className="text-marinho-700 hover:underline">
                      {patientName.get(l.patientId)}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-400">{l.ip}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">Nenhum registro com esses filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-4 text-sm">
          {page > 1 ? <Link href={href({ pagina: String(page - 1) })} className="btn-secondary">← Anteriores</Link> : <span />}
          <span className="text-slate-500">Página {page} de {pages}</span>
          {page < pages && <Link href={href({ pagina: String(page + 1) })} className="btn-secondary">Próximos →</Link>}
        </div>
      )}
    </div>
  );
}
