import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { displayName } from "@/lib/staff";
import { billDays, billKindLabel, payerKind, payerLabel } from "@/lib/conta-hospitalar";
import { ActionForm } from "../../financeiro/action-form";
import { PrintButton } from "../../pacientes/[id]/atendimentos/[encounterId]/print-button";
import { addBillItem, closeBill, removeBillItem } from "../actions";
import { refreshBill } from "../data";

const ORDER = ["DIARIA", "CIRURGIA", "EXAME", "MEDICAMENTO", "TAXA", "OUTRO"];

// Conta de uma internação. Aberta, é recalculada a cada vez que a página abre.
export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("contas");
  const { id } = await params;
  const admission = await prisma.admission.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { patient: { select: { name: true, socialName: true, cpf: true } }, bed: { include: { ward: true } }, attending: { select: { name: true, sex: true, jobTitle: true } } },
  });
  if (!admission) notFound();
  await refreshBill(user.clinicId, admission.id);
  const bill = await prisma.hospitalBill.findFirstOrThrow({
    where: { clinicId: user.clinicId, admissionId: admission.id },
    include: { items: { orderBy: [{ at: "asc" }] }, closedBy: { select: { name: true, sex: true, jobTitle: true } } },
  });
  const open = bill.status === "ABERTA";
  const kind = payerKind(bill.payer);
  const groups = ORDER.map((k) => ({ kind: k, items: bill.items.filter((i) => i.kind === k) })).filter((g) => g.items.length);
  const missing = bill.items.filter((i) => i.unitCents === 0);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-2">
        <Link href="/contas" className="no-print text-sm text-marinho-700 hover:underline">← Contas hospitalares</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Conta hospitalar · {admission.patient.socialName || admission.patient.name}</h1>
          <div className="no-print"><PrintButton /></div>
        </div>
        <p className="text-sm text-slate-600">
          Internação de {formatDate(admission.admittedAt)} {admission.dischargedAt ? `a ${formatDate(admission.dischargedAt)}` : "(ainda internado)"} ·{" "}
          {billDays(admission.admittedAt, admission.dischargedAt)} diária(s) · {admission.bed.ward.name} {admission.bed.code} · {displayName(admission.attending)}
        </p>
        <p className="text-sm">
          Pagador: <strong>{bill.payer}</strong> ({payerLabel[kind]}) ·{" "}
          {open ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">aberta</span> : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">fechada em {formatDateTime(bill.closedAt)}{bill.closedBy && ` por ${displayName(bill.closedBy)}`}</span>}
        </p>
      </div>

      <section className="card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Qtd.</th>
              <th className="px-3 py-2 text-right">Valor unitário</th>
              <th className="px-3 py-2 text-right">Total</th>
              {open && <th className="no-print px-3 py-2"></th>}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.kind} className="divide-y divide-slate-100">
              <tr className="bg-slate-50/60">
                <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold uppercase text-marinho-800">{billKindLabel[g.kind]}</td>
                <td className="px-3 py-1.5 text-right text-xs font-semibold text-marinho-800">{formatMoney(g.items.reduce((s, i) => s + i.totalCents, 0))}</td>
                {open && <td className="no-print"></td>}
              </tr>
              {g.items.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-1.5">{i.description}{!i.source && <span className="ml-2 text-xs text-slate-400">lançado à mão</span>}</td>
                  <td className="px-3 py-1.5 text-right">{i.quantity}</td>
                  <td className="px-3 py-1.5 text-right">{i.unitCents === 0 ? <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">sem preço</span> : formatMoney(i.unitCents)}</td>
                  <td className="px-3 py-1.5 text-right">{formatMoney(i.totalCents)}</td>
                  {open && (
                    <td className="no-print px-3 py-1.5 text-right">
                      {!i.source && (
                        <form action={removeBillItem.bind(null, admission.id, i.id)}><button className="text-xs text-red-700 hover:underline">Tirar</button></form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr className="border-t-2 border-slate-200">
              <td colSpan={3} className="px-3 py-2 text-right font-semibold">Total</td>
              <td className="px-3 py-2 text-right text-lg font-semibold text-marinho-800">{formatMoney(bill.totalCents)}</td>
              {open && <td className="no-print"></td>}
            </tr>
          </tfoot>
        </table>
      </section>

      {open && missing.length > 0 && (
        <p className="no-print rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {missing.length} item(ns) sem preço. Cadastre em <Link href="/contas/precos" className="underline">Tabela de preços</Link>; a conta se atualiza sozinha.
        </p>
      )}

      {!open && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {kind === "PARTICULAR" && (bill.chargeId ? "A cobrança do paciente foi lançada em Financeiro > Receitas." : "Sem valor a cobrar.")}
          {kind === "SUS" && "Conta do SUS: serve de espelho do que a internação gastou. O SUS paga pela AIH (o laudo de AIH sai na ficha do paciente)."}
          {kind === "CONVENIO" && "Conta de convênio: envie ao convênio junto com a guia de internação. A guia TISS de internação ainda vai entrar no sistema."}
        </p>
      )}

      {open && (
        <div className="no-print grid gap-6 lg:grid-cols-2">
          <ActionForm action={addBillItem.bind(null, admission.id)} submitLabel="Lançar">
            <h2 className="font-semibold text-marinho-800">Lançar à mão</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="kind">Tipo</label>
                <select className="input" id="kind" name="kind" defaultValue="TAXA">
                  <option value="TAXA">Taxa</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="description">Descrição</label>
                <input className="input" id="description" name="description" required placeholder="Ex.: Diária de acompanhante" />
              </div>
              <div>
                <label className="label" htmlFor="quantity">Quantidade</label>
                <input className="input" id="quantity" name="quantity" type="number" min={1} defaultValue={1} required />
              </div>
              <div>
                <label className="label" htmlFor="unit">Valor unitário (R$)</label>
                <input className="input" id="unit" name="unit" required placeholder="0,00" inputMode="decimal" />
              </div>
            </div>
          </ActionForm>

          {admission.dischargedAt ? (
            <ActionForm action={closeBill.bind(null, admission.id)} submitLabel="Fechar conta" resetOnSuccess={false}>
              <h2 className="font-semibold text-marinho-800">Fechar a conta</h2>
              <p className="text-sm text-slate-600">
                Depois de fechada, a conta não muda mais.{kind === "PARTICULAR" && " O total vira uma cobrança do paciente em Financeiro > Receitas."}
              </p>
              {missing.length > 0 && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="semPreco" className="w-auto!" /> Fechar mesmo com itens sem preço</label>
              )}
            </ActionForm>
          ) : (
            <div className="card text-sm text-slate-600">A conta fecha depois da alta. Até lá ela vai se atualizando com as diárias, os medicamentos, os exames e as cirurgias.</div>
          )}
        </div>
      )}
    </div>
  );
}
