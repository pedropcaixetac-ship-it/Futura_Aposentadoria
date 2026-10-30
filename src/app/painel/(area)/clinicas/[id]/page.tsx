import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePlatformUser } from "@/lib/painel-auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { platformActionLabel } from "@/lib/painel";
import { ActionForm } from "@/app/(app)/financeiro/action-form";
import { ClinicForm } from "../../clinic-form";
import { reactivateClinic, suspendClinic, updateClinic } from "../../actions";

export default async function ClinicPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criada?: string }> }) {
  await requirePlatformUser();
  const { id } = await params;
  const { criada } = await searchParams;
  const clinic = await prisma.clinic.findUnique({ where: { id } });
  if (!clinic) notFound();

  // Só dados administrativos: quantos usuários e pacientes, quem são os gerentes. Nada do prontuário.
  const [users, patients, encounters, managers, lastLogin, history] = await Promise.all([
    prisma.user.count({ where: { clinicId: id, active: true, systemAccess: true } }),
    prisma.patient.count({ where: { clinicId: id } }),
    prisma.encounter.count({ where: { clinicId: id } }),
    prisma.user.findMany({
      where: { clinicId: id, role: "ADMIN", active: true },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.auditLog.findFirst({ where: { clinicId: id, action: "LOGIN" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.platformAuditLog.findMany({ where: { clinicId: id }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/painel" className="text-sm text-marinho-600 hover:underline">← Clínicas</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-marinho-800">{clinic.name}</h1>
        {clinic.active
          ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Ativa</span>
          : <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">Suspensa</span>}
      </div>

      {criada && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Clínica cadastrada. Passe ao gerente o código <strong className="font-mono">{clinic.slug}</strong>, o e-mail e a senha inicial.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card"><p className="text-sm text-slate-500">Usuários com acesso</p><p className="text-2xl font-semibold text-marinho-800">{users}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Pacientes</p><p className="text-2xl font-semibold text-marinho-800">{patients}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Atendimentos</p><p className="text-2xl font-semibold text-marinho-800">{encounters}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Último acesso</p><p className="text-base font-semibold text-marinho-800">{lastLogin ? formatDateTime(lastLogin.createdAt) : "Nunca"}</p></div>
      </div>

      <section className="card space-y-3">
        <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">Gerentes do sistema da clínica</h2>
        {managers.length === 0 && <p className="text-sm text-slate-500">Nenhum gerente ativo.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {managers.map((m) => (
            <li key={m.id} className="py-2">
              <span className="font-medium">{m.name}</span>
              <span className="text-slate-500"> · {m.email ?? "sem e-mail"}{m.phone && ` · ${m.phone}`}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          A equipe da empresa não vê pacientes nem prontuários. Para ajudar a clínica, fale com o gerente.
        </p>
      </section>

      <ClinicForm
        action={updateClinic.bind(null, clinic.id)}
        clinic={{
          name: clinic.name, slug: clinic.slug, cnpj: clinic.cnpj, address: clinic.address, phone: clinic.phone,
          contactName: clinic.contactName, contactEmail: clinic.contactEmail, contactPhone: clinic.contactPhone,
        }}
      />

      <section className="card space-y-3">
        <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">Acesso da clínica</h2>
        {clinic.active ? (
          <ActionForm action={suspendClinic.bind(null, clinic.id)} submitLabel="Suspender acesso" resetOnSuccess={false} className="space-y-3">
            <p className="text-sm text-slate-600">
              Suspender tira todos da clínica do sistema na hora. Nada é apagado: ao reativar, tudo volta como estava.
            </p>
            <div>
              <label className="label" htmlFor="reason">Motivo</label>
              <input className="input" id="reason" name="reason" required placeholder="Ex.: mensalidade em atraso" />
            </div>
          </ActionForm>
        ) : (
          <form action={reactivateClinic.bind(null, clinic.id)} className="space-y-3">
            <p className="text-sm text-slate-600">
              Suspensa em {formatDate(clinic.suspendedAt)}. Motivo: {clinic.suspendedReason ?? "não informado"}.
            </p>
            <button className="btn-primary">Reativar acesso</button>
          </form>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">O que a empresa fez nesta clínica</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {history.map((h) => (
            <li key={h.id} className="py-2">
              <span className="text-slate-500">{formatDateTime(h.createdAt)}</span> · {h.user?.name ?? "—"} · {platformActionLabel[h.action] ?? h.action}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
