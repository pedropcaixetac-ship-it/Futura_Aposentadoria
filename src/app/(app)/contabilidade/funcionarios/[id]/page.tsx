import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { dateInput, today } from "@/lib/finance";
import { daysBetween, employmentTypeLabel, laborAlerts, terminationReasons, trialEnd, vacationPeriods } from "@/lib/accounting";
import { ActionForm } from "../../../financeiro/action-form";
import { addVacation, deleteVacation, reinstateEmployee, saveEmployee, terminateEmployee } from "../../actions";
import { requireAccountingPage } from "../../data";
import { EmployeeFields } from "../employee-fields";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccountingPage();
  const { id } = await params;
  const employee = await prisma.employee.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { vacations: { orderBy: { startDate: "desc" } } },
  });
  if (!employee) notFound();
  const now = today();
  const alerts = laborAlerts(employee, employee.vacations, now);
  const clt = employee.type === "CLT";
  const { periods, current } = vacationPeriods(employee.admissionDate, employee.vacations, employee.terminatedAt ?? now);

  return (
    <div className="space-y-5">
      <Link href="/contabilidade/funcionarios" className="text-sm text-marinho-700 hover:underline">← Funcionários</Link>

      <div className="card space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-marinho-800">{employee.name}</h2>
          {employee.terminatedAt ? (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Desligado em {formatDate(employee.terminatedAt)}</span>
          ) : (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Ativo</span>
          )}
        </div>
        <p className="text-sm text-slate-600">
          {employee.jobTitle}
          {employee.sector && ` · ${employee.sector}`} · {employmentTypeLabel[employee.type]} · desde {formatDate(employee.admissionDate)} ·{" "}
          {formatMoney(employee.salaryCents)}
        </p>
        {alerts.map((a, i) => (
          <p key={i} className={`rounded-md px-3 py-2 text-sm ${a.tone === "red" ? "bg-red-50 text-red-700" : "bg-dourado-100 text-dourado-700"}`}>{a.text}</p>
        ))}
      </div>

      {clt && (
        <div className="card space-y-4">
          <div>
            <h2 className="font-semibold">Férias</h2>
            <p className="text-sm text-slate-500">
              A cada 12 meses de trabalho a pessoa ganha 30 dias de férias, que devem ser tiradas nos 12 meses seguintes. Podem ser divididas em
              até 3 partes (uma com pelo menos 14 dias).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-1 pr-4 font-medium">Período trabalhado</th>
                  <th className="py-1 pr-4 font-medium">Tirar até</th>
                  <th className="py-1 pr-4 font-medium">Dias tirados</th>
                  <th className="py-1 font-medium">Faltam</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.start.toISOString()} className="border-t border-slate-100">
                    <td className="py-1 pr-4">{formatDate(p.start)} a {formatDate(p.end)}</td>
                    <td className={`py-1 pr-4 ${p.remaining && p.deadline < now ? "font-medium text-red-700" : ""}`}>{formatDate(p.deadline)}</td>
                    <td className="py-1 pr-4">{p.daysTaken}</td>
                    <td className="py-1">{p.remaining ? `${p.remaining} dias` : "Quitado"}</td>
                  </tr>
                ))}
                {!employee.terminatedAt && (
                  <tr className="border-t border-slate-100 text-slate-400">
                    <td className="py-1 pr-4">{formatDate(current.start)} a {formatDate(current.end)}</td>
                    <td className="py-1" colSpan={3}>Em andamento: as férias deste período só podem ser tiradas depois de {formatDate(current.end)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {employee.vacations.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm">
              {employee.vacations.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {formatDate(v.startDate)} a {formatDate(v.endDate)} · {daysBetween(v.startDate, v.endDate)} dias
                    {v.startDate > now && <span className="ml-2 rounded bg-marinho-50 px-1.5 py-0.5 text-xs text-marinho-700">marcadas</span>}
                    {v.notes && <span className="text-slate-500"> · {v.notes}</span>}
                  </span>
                  <form action={deleteVacation.bind(null, v.id)}>
                    <button className="text-xs text-slate-400 hover:text-red-600">Apagar</button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <details className="rounded-md bg-marinho-50 p-4">
            <summary className="cursor-pointer text-sm font-medium">+ Registrar ou marcar férias</summary>
            <ActionForm action={addVacation.bind(null, employee.id)} submitLabel="Salvar férias" className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="startDate">Primeiro dia</label>
                  <input className="input" id="startDate" name="startDate" type="date" required />
                </div>
                <div>
                  <label className="label" htmlFor="endDate">Último dia</label>
                  <input className="input" id="endDate" name="endDate" type="date" required />
                </div>
                <div>
                  <label className="label" htmlFor="vacationNotes">Observação</label>
                  <input className="input" id="vacationNotes" name="notes" placeholder="Ex.: vendeu 10 dias" />
                </div>
              </div>
            </ActionForm>
          </details>
        </div>
      )}
      {clt && !employee.terminatedAt && now <= trialEnd(employee.admissionDate) && (
        <p className="text-sm text-slate-500">O contrato de experiência dura até 90 dias e pode ser encerrado sem aviso prévio no último dia.</p>
      )}

      <details className="card group">
        <summary className="cursor-pointer list-none font-semibold text-marinho-800">Editar cadastro</summary>
        <ActionForm action={saveEmployee.bind(null, employee.id)} submitLabel="Salvar alterações" className="mt-4 space-y-6" resetOnSuccess={false}>
          <EmployeeFields employee={employee} />
        </ActionForm>
      </details>

      <div className="card space-y-3">
        <h2 className="font-semibold">Desligamento</h2>
        {employee.terminatedAt ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              Último dia: <strong>{formatDate(employee.terminatedAt)}</strong> · {employee.terminationReason}
            </p>
            <form action={reinstateEmployee.bind(null, employee.id)}>
              <button className="text-xs text-slate-500 hover:text-marinho-700">Desfazer desligamento</button>
            </form>
          </div>
        ) : (
          <details>
            <summary className="cursor-pointer text-sm text-slate-600">Registrar desligamento</summary>
            <ActionForm action={terminateEmployee.bind(null, employee.id)} submitLabel="Registrar desligamento" className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="terminatedAt">Último dia de trabalho</label>
                  <input className="input" id="terminatedAt" name="terminatedAt" type="date" defaultValue={dateInput(now)} required />
                </div>
                <div>
                  <label className="label" htmlFor="terminationReason">Motivo</label>
                  <select className="input" id="terminationReason" name="terminationReason" defaultValue="" required>
                    <option value="" disabled>Escolha...</option>
                    {terminationReasons.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Avise o contador no mesmo dia: a rescisão (CLT) precisa ser paga em até 10 dias depois do último dia de trabalho. Isto não bloqueia
                o acesso ao sistema; para isso, use o cadastro de usuários.
              </p>
            </ActionForm>
          </details>
        )}
      </div>
    </div>
  );
}
