import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatCpf, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { today } from "@/lib/finance";
import { hasTab } from "@/lib/tabs";
import { staffFunction } from "@/lib/staff";
import { daysBetween, employmentTypeLabel, laborAlerts, trialEnd, vacationPeriods } from "@/lib/accounting";
import { ActionForm } from "../../../financeiro/action-form";
import { addVacation, deleteVacation, saveContract } from "../../actions";
import { requireAccountingPage } from "../../data";
import { ContractFields } from "../contract-fields";

// O id é o da pessoa no cadastro de servidores.
export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccountingPage();
  const { id } = await params;
  const person = await prisma.user.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { contract: { include: { vacations: { orderBy: { startDate: "desc" } } } } },
  });
  if (!person) notFound();
  const contract = person.contract;
  const now = today();
  const canEditPerson = hasTab(user, "servidores");
  const job = contract && { ...contract, terminatedAt: person.terminatedAt };
  const alerts = job ? laborAlerts(job, contract.vacations, now) : [];

  return (
    <div className="space-y-5">
      <Link href="/contabilidade/funcionarios" className="text-sm text-marinho-700 hover:underline">← Funcionários</Link>

      <div className="card space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-marinho-800">{person.name}</h2>
          {person.terminatedAt ? (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Desligado em {formatDate(person.terminatedAt)}</span>
          ) : (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Ativo</span>
          )}
        </div>
        <p className="text-sm text-slate-600">
          {staffFunction(person)}
          {person.sector && ` · ${person.sector}`}
          {person.cpf && ` · CPF ${formatCpf(person.cpf)}`}
          {contract && ` · ${employmentTypeLabel[contract.type]} · desde ${formatDate(contract.admissionDate)} · ${formatMoney(contract.salaryCents)}`}
        </p>
        {person.terminatedAt && <p className="text-sm text-slate-500">Motivo do desligamento: {person.terminationReason}</p>}
        <p className="text-xs text-slate-500">
          Nome, CPF, função, setor e desligamento ficam no cadastro de servidores
          {canEditPerson ? (
            <>
              {" "}
              (<Link href={`/servidores/${person.id}`} className="text-marinho-700 hover:underline">editar cadastro</Link>
              {!person.terminatedAt && (
                <>
                  {" · "}
                  <Link href={`/servidores/${person.id}/desligamento`} className="text-marinho-700 hover:underline">registrar desligamento</Link>
                </>
              )}
              ).
            </>
          ) : (
            ", que só o administrador altera."
          )}
        </p>
        {alerts.map((a, i) => (
          <p key={i} className={`rounded-md px-3 py-2 text-sm ${a.tone === "red" ? "bg-red-50 text-red-700" : "bg-dourado-100 text-dourado-700"}`}>{a.text}</p>
        ))}
      </div>

      {contract?.type === "CLT" && job && (
        <Vacations contract={contract} job={job} now={now} />
      )}

      <details className="card" open={!contract}>
        <summary className="cursor-pointer list-none font-semibold text-marinho-800">
          {contract ? "Editar contrato de trabalho" : "Dados do contrato de trabalho"}
        </summary>
        {!contract && (
          <p className="mt-2 text-sm text-slate-500">Preencha só para quem é funcionário da clínica (CLT, estágio, PJ ou autônomo com pagamento mensal).</p>
        )}
        <ActionForm action={saveContract.bind(null, person.id)} submitLabel="Salvar contrato" className="mt-4 space-y-4" resetOnSuccess={false}>
          <ContractFields contract={contract} />
        </ActionForm>
      </details>
    </div>
  );
}

function Vacations({ contract, job, now }: {
  contract: { id: string; admissionDate: Date; vacations: { id: string; startDate: Date; endDate: Date; notes: string | null }[] };
  job: { terminatedAt: Date | null; admissionDate: Date };
  now: Date;
}) {
  const { periods, current } = vacationPeriods(contract.admissionDate, contract.vacations, job.terminatedAt ?? now);
  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">Férias</h2>
        <p className="text-sm text-slate-500">
          A cada 12 meses de trabalho a pessoa ganha 30 dias de férias, que devem ser tiradas nos 12 meses seguintes. Podem ser divididas em até 3
          partes (uma com pelo menos 14 dias).
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
            {!job.terminatedAt && (
              <tr className="border-t border-slate-100 text-slate-400">
                <td className="py-1 pr-4">{formatDate(current.start)} a {formatDate(current.end)}</td>
                <td className="py-1" colSpan={3}>Em andamento: as férias deste período só podem ser tiradas depois de {formatDate(current.end)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {contract.vacations.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {contract.vacations.map((v) => (
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
        <ActionForm action={addVacation.bind(null, contract.id)} submitLabel="Salvar férias" className="mt-3 space-y-3">
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
      {!job.terminatedAt && now <= trialEnd(contract.admissionDate) && (
        <p className="text-sm text-slate-500">O contrato de experiência dura até 90 dias e pode ser encerrado sem aviso prévio no último dia.</p>
      )}
    </div>
  );
}
