import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePlatformUser } from "@/lib/painel-auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { platformActionLabel } from "@/lib/painel";
import { ActionForm } from "@/app/(app)/financeiro/action-form";
import { ClinicForm } from "../../clinic-form";
import { cancelPayment, reactivateClinic, registerPayment, setClinicPlan, suspendClinic, updateClinic } from "../../actions";
import { ChargeLink } from "../../charge-link";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/painel-financeiro";
import { billingLabel, billingStatus, GRACE_DAYS, MODULES, todayDate } from "@/lib/plans";
import { formatMoney, moneyInput } from "@/lib/money";

export default async function ClinicPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criada?: string }> }) {
  await requirePlatformUser();
  const { id } = await params;
  const { criada } = await searchParams;
  const clinic = await prisma.clinic.findUnique({ where: { id }, include: { plan: true } });
  if (!clinic) notFound();

  // Só dados administrativos: quantos usuários e pacientes, quem são os gerentes. Nada do prontuário.
  const [users, patients, encounters, managers, lastLogin, history, payments] = await Promise.all([
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
    prisma.clinicPayment.findMany({
      where: { clinicId: id },
      include: { createdBy: { select: { name: true } }, canceledBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
  ]);
  const lastPaymentId = payments.find((p) => !p.canceledAt)?.id;
  const plans = await prisma.plan.findMany({ where: { OR: [{ active: true }, { id: clinic.planId ?? "" }] }, orderBy: { priceCents: "asc" } });
  const billing = billingStatus(clinic.paidUntil);
  const billingColor = { "sem-controle": "text-slate-600", "em-dia": "text-emerald-700", "vence-logo": "text-dourado-700", atrasada: "text-red-700", bloqueada: "text-red-700" }[billing.kind];

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

      <section className="card space-y-4">
        <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">Plano e mensalidade</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Plano</p>
            <p className="text-sm font-medium">{clinic.plan ? `${clinic.plan.name} · ${formatMoney(clinic.plan.priceCents)}/mês` : "Sem plano (tudo liberado)"}</p>
            {clinic.plan && (
              <p className="text-xs text-slate-500">
                {clinic.plan.maxUsers ? `Até ${clinic.plan.maxUsers} usuários` : "Usuários sem limite"} ·{" "}
                {MODULES.filter((m) => clinic.plan!.modules.includes(m.key)).map((m) => m.label).join(", ") || "só o básico"}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Pago até</p>
            <p className="text-sm font-medium">{clinic.paidUntil ? formatDate(clinic.paidUntil) : "Sem controle"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Situação</p>
            <p className={`text-sm font-semibold ${billingColor}`}>{billingLabel(billing)}</p>
            {billing.kind === "atrasada" && <p className="text-xs text-slate-500">O acesso é suspenso sozinho em {billing.daysToBlock} dia(s).</p>}
            {billing.kind !== "sem-controle" && billing.kind !== "em-dia" && <ChargeLink clinic={clinic} />}
          </div>
        </div>

        <ActionForm action={registerPayment.bind(null, clinic.id)} submitLabel="Registrar pagamento" className="space-y-3 rounded-md bg-marinho-50 p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="amount">Valor recebido (R$)</label>
              <input className="input" id="amount" name="amount" inputMode="decimal" required defaultValue={clinic.plan ? moneyInput(clinic.plan.priceCents) : ""} />
            </div>
            <div>
              <label className="label" htmlFor="method">Forma</label>
              <select className="input" id="method" name="method" defaultValue="pix">
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="paidAt">Data do pagamento</label>
              <input className="input" id="paidAt" name="paidAt" type="date" defaultValue={todayDate().toISOString().slice(0, 10)} />
            </div>
            <div>
              <label className="label" htmlFor="notes">Observação</label>
              <input className="input" id="notes" name="notes" placeholder="Opcional" />
            </div>
          </div>
          <p className="text-xs text-slate-500">Recebeu o Pix ou o boleto? Registrar estende o &quot;pago até&quot; em um mês e libera a clínica se estava bloqueada.</p>
        </ActionForm>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-marinho-800">Pagamentos recebidos</h3>
          {payments.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum pagamento registrado ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {payments.map((p) => (
                <li key={p.id} className={`space-y-2 py-2 ${p.canceledAt ? "text-slate-400" : ""}`}>
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-medium">{formatDate(p.paidAt)}</span>
                    <span className={p.canceledAt ? "line-through" : "font-semibold text-emerald-700"}>{formatMoney(p.amountCents)}</span>
                    <span>{PAYMENT_METHODS[p.method as PaymentMethod] ?? p.method}</span>
                    <span className="text-slate-500">pago até {formatDate(p.paidUntil)} · registrado por {p.createdBy.name}</span>
                    {p.notes && <span className="text-slate-500">· {p.notes}</span>}
                  </div>
                  {p.canceledAt && (
                    <p className="text-xs">Desfeito em {formatDateTime(p.canceledAt)} por {p.canceledBy?.name ?? "—"}: {p.cancelReason}</p>
                  )}
                  {p.id === lastPaymentId && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-marinho-700 hover:underline">Lançou errado? Desfazer este pagamento</summary>
                      <ActionForm action={cancelPayment.bind(null, p.id)} submitLabel="Desfazer pagamento" className="mt-2 flex flex-wrap items-end gap-3">
                        <div>
                          <label className="label" htmlFor={`reason-${p.id}`}>Motivo</label>
                          <input className="input" id={`reason-${p.id}`} name="reason" required placeholder="Ex.: valor digitado errado" />
                        </div>
                      </ActionForm>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <ActionForm action={setClinicPlan.bind(null, clinic.id)} submitLabel="Salvar plano e vencimento" resetOnSuccess={false} className="grid gap-4 sm:grid-cols-3 sm:items-end">
          <div>
            <label className="label" htmlFor="planId">Mudar plano</label>
            <select className="input" id="planId" name="planId" defaultValue={clinic.planId ?? ""}>
              <option value="">Sem plano (tudo liberado)</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.priceCents)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="paidUntil">Pago até (ajuste manual)</label>
            <input className="input" id="paidUntil" name="paidUntil" type="date" defaultValue={clinic.paidUntil?.toISOString().slice(0, 10) ?? ""} />
          </div>
          <p className="text-xs text-slate-500">
            Data vazia: a mensalidade não é controlada. Com data, o gerente da clínica é avisado 5 dias antes e o acesso é
            suspenso sozinho {GRACE_DAYS} dias depois do vencimento.
          </p>
        </ActionForm>
      </section>

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
