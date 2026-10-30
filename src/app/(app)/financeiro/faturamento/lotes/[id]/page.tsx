import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { displayName } from "@/lib/staff";
import { claimNumberLabel } from "@/lib/tiss";
import { buildBatchXml } from "@/lib/tiss-xml";
import { undoBatch } from "../../actions";
import { loadBatch } from "./data";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) notFound();
  const loaded = await loadBatch(user.clinicId, (await params).id);
  if (!loaded) notFound();
  const { batch, input } = loaded;
  const { hash } = buildBatchXml(input);
  const total = batch.claims.reduce((t, c) => t + c.amountCents, 0);

  return (
    <div className="space-y-5">
      <Link href="/financeiro/faturamento" className="text-sm text-marinho-700 hover:underline">‹ Faturamento</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Lote nº {batch.number} — {batch.healthPlan.name}</h2>
          <p className="text-sm text-slate-500">
            Fechado em {formatDateTime(batch.createdAt)} · {batch.claims.length} guia(s) · {formatMoney(total)} · padrão TISS {batch.tissVersion}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={undoBatch.bind(null, batch.id)}>
            <button className="btn-secondary">Desfazer lote</button>
          </form>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
