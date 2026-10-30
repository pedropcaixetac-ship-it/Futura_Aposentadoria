import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney, moneyInput } from "@/lib/money";
import { dateInput, today } from "@/lib/finance";
import { displayName } from "@/lib/staff";
import { claimKindLabel, claimNumberLabel } from "@/lib/tiss";
import { buildBatchXml } from "@/lib/tiss-xml";
import { registerBatchPayment, saveBatchProtocol, undoBatch } from "../../actions";
import { ActionForm } from "../../../action-form";
import { loadBatch } from "./data";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) notFound();
  const loaded = await loadBatch(user.clinicId, (await params).id);
  if (!loaded) notFound();
  const { batch, input } = loaded;
  const { hash } = buildBatchXml(input);
  const total = batch.claims.reduce((t, c) => t + c.amountCents, 0);
  const paid = batch.claims.reduce((t, c) => t + (c.paidCents ?? 0), 0);

  return (
    <div className="space-y-5">
      <Link href="/financeiro/faturamento" className="text-sm text-marinho-700 hover:underline">‹ Faturamento</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Lote nº {batch.number} — {batch.healthPlan.name} · {claimKindLabel(batch.kind)}</h2>
          <p className="text-sm text-slate-500">
            Fechado em {formatDateTime(batch.createdAt)} · {batch.claims.length} guia(s) · {formatMoney(total)} · padrão TISS {batch.tissVersion}
          </p>
        </div>
        <div className="flex gap-2">
          {!batch.paidAt && (
            <form action={undoBatch.bind(null, batch.id)}>
              <button className="btn-secondary">Desfazer lote</button>
            </form>
          )}
          <a href={`/financeiro/faturamento/lotes/${batch.id}/xml`} className="btn-primary">Baixar arquivo XML</a>
        </div>
      </div>

      <div className="card space-y-1 text-sm text-slate-600">
        <p className="font-medium text-marinho-800">Como enviar</p>
        <p>Baixe o arquivo e envie no portal do {batch.healthPlan.name}, na área de envio de lote XML (TISS).</p>
        <p>
          O portal confere o código de segurança do arquivo:{" "}
          <span className="font-mono text-xs text-slate-800">{hash}</span>. Se o portal recusar o arquivo,
          desfaça o lote, corrija as guias e feche um novo lote.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ActionForm action={saveBatchProtocol.bind(null, batch.id)} submitLabel="Salvar protocolo" resetOnSuccess={false}>
          <div>
            <label className="label" htmlFor="protocol">Protocolo do convênio</label>
            <input className="input" id="protocol" name="protocol" defaultValue={batch.protocol ?? ""} placeholder="Número que o portal mostra ao receber o arquivo" />
          </div>
        </ActionForm>
        {batch.paidAt ? (
          <div className="card space-y-1 text-sm">
            <p className="font-medium text-marinho-800">Pagamento conferido em {formatDate(batch.paidAt)}</p>
            <p>Pago: <span className="font-semibold">{formatMoney(paid)}</span></p>
            <p className={total > paid ? "text-red-700" : "text-slate-500"}>Glosado (não pago): {formatMoney(total - paid)}</p>
            <p className="text-slate-500">O valor pago entrou nas Receitas, com forma de pagamento Convênio.</p>
          </div>
        ) : (
          <div className="card space-y-1 text-sm text-slate-600">
            <p className="font-medium text-marinho-800">Quando o convênio pagar</p>
            <p>
              Confira o demonstrativo de pagamento do convênio e preencha, na tabela abaixo, quanto foi pago em cada guia.
              O que não foi pago é a glosa: anote o motivo para poder recorrer.
            </p>
          </div>
        )}
      </div>

      {batch.paidAt ? (
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Guia</th>
              <th className="px-4 py-2 font-medium">Data</th>
              <th className="px-4 py-2 font-medium">Paciente</th>
              <th className="px-4 py-2 font-medium">Carteirinha</th>
              <th className="px-4 py-2 font-medium">Profissional</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 text-right font-medium">Pago</th>
              <th className="px-4 py-2 font-medium">Glosa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batch.claims.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2">
                  <Link href={`/financeiro/faturamento/${c.id}`} className="font-mono text-marinho-700 hover:underline">{claimNumberLabel(c.number)}</Link>
                </td>
                <td className="px-4 py-2">{formatDate(c.serviceDate)}</td>
                <td className="px-4 py-2">{c.patient.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{c.cardNumber}</td>
                <td className="px-4 py-2">{displayName(c.professional)}</td>
                <td className="px-4 py-2 text-right">{formatMoney(c.amountCents)}</td>
                <td className="px-4 py-2 text-right">{formatMoney(c.paidCents ?? 0)}</td>
                <td className="px-4 py-2 text-red-700">{c.glossReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (
        <ActionForm action={registerBatchPayment.bind(null, batch.id)} submitLabel="Registrar pagamento" resetOnSuccess={false}>
          <div className="max-w-xs">
            <label className="label" htmlFor="paidAt">Data do pagamento *</label>
            <input className="input" id="paidAt" name="paidAt" type="date" defaultValue={dateInput(today())} required />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Guia</th>
                  <th className="py-2 pr-3 font-medium">Paciente</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor</th>
                  <th className="py-2 pr-3 font-medium">Pago (R$)</th>
                  <th className="py-2 font-medium">Motivo da glosa, se pagou menos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batch.claims.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 font-mono">{claimNumberLabel(c.number)}</td>
                    <td className="py-2 pr-3">{c.patient.name}</td>
                    <td className="py-2 pr-3 text-right">{formatMoney(c.amountCents)}</td>
                    <td className="py-2 pr-3">
                      <input className="input w-28!" name={`pago_${c.id}`} defaultValue={moneyInput(c.amountCents)} inputMode="decimal" aria-label={`Valor pago da guia ${c.number}`} />
                    </td>
                    <td className="py-2">
                      <input className="input" name={`glosa_${c.id}`} maxLength={300} aria-label={`Motivo da glosa da guia ${c.number}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
