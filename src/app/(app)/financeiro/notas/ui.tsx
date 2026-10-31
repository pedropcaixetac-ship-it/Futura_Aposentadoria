import type { InvoiceIssuer, ServiceInvoice } from "@prisma/client";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { dateInput, today } from "@/lib/finance";
import { invoiceFields, invoiceMissing, NFSE_EMISSOR_URL, type InvoiceCharge, type InvoiceClinic, type InvoiceProfessional } from "@/lib/nfse";
import { ActionForm } from "../action-form";
import { focusConfigured, focusIsProduction } from "@/lib/nfse-focus";
import { cancelInvoice, emitInvoice, markInvoiceIssued, refreshInvoice, requestInvoice } from "./actions";

type Props = {
  invoice: ServiceInvoice | null;
  chargeId: string;
  canRequest: boolean;
  canIssue: boolean;
};

// Situação da nota numa linha de cobrança: botão para anotar o pedido, "pedida" ou o número da nota.
export function InvoiceStatus({ invoice, chargeId, canRequest, canIssue }: Props) {
  if (!invoice || invoice.status === "CANCELADA") {
    return canRequest ? (
      <form action={requestInvoice.bind(null, chargeId)}>
        <button className="text-xs font-medium text-marinho-700 hover:underline" title="O paciente pediu nota fiscal">
          Pedir nota
        </button>
      </form>
    ) : null;
  }
  if (invoice.status === "EMITIDA") {
    return <InvoiceNumber invoice={invoice} />;
  }
  return (
    <span className="flex items-center gap-2">
      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Nota pedida</span>
      {canIssue && (
        <form action={cancelInvoice.bind(null, invoice.id)}>
          <button className="text-xs text-slate-400 hover:text-red-600" title="O paciente desistiu da nota">Desfazer</button>
        </form>
      )}
    </span>
  );
}

// Número da nota emitida, com link para o PDF (ou a consulta no portal nacional) quando foi emitida pelo sistema.
export function InvoiceNumber({ invoice }: { invoice: ServiceInvoice }) {
  const link = invoice.pdfUrl ?? invoice.url;
  const badge = <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">NF {invoice.number}</span>;
  return link ? (
    <a href={link} target="_blank" rel="noreferrer" title="Abrir a nota" className="hover:underline">{badge}</a>
  ) : badge;
}

// Emissão automática pela Focus NFe: botão de emitir, situação do envio e motivo do erro.
function AutomaticIssue({ invoice, missing }: { invoice: ServiceInvoice; missing: string[] }) {
  const testMode = !focusIsProduction();
  if (invoice.providerStatus === "processando") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-marinho-50 px-3 py-2 text-sm text-marinho-800">
        Nota enviada. A prefeitura está analisando.
        <form action={refreshInvoice.bind(null, invoice.id)}>
          <button className="btn-secondary px-3! py-1! text-xs!">Atualizar</button>
        </form>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {invoice.providerStatus === "erro" && invoice.providerMessage && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          A última tentativa não foi aceita: {invoice.providerMessage}
        </p>
      )}
      {missing.length === 0 && (
        <ActionForm action={emitInvoice.bind(null, invoice.id)} submitLabel={invoice.providerStatus === "erro" ? "Tentar de novo" : "Emitir nota"} className="flex flex-wrap items-center gap-3">
          {testMode && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Modo de teste: a nota não tem valor fiscal</span>}
        </ActionForm>
      )}
    </div>
  );
}

// Uma nota pedida: os dados para copiar no emissor nacional e o espaço para anotar o número.
export function PendingInvoice({ invoice, issuer, clinic, professional, charge, canIssue }: {
  invoice: ServiceInvoice;
  issuer: InvoiceIssuer;
  clinic: InvoiceClinic;
  professional: InvoiceProfessional;
  charge: InvoiceCharge;
  canIssue: boolean;
}) {
  const missing = invoiceMissing(issuer, clinic, professional, charge);
  const f = invoiceFields(issuer, clinic, professional, charge);
  const rows: [string, string][] = [
    ["Prestador", `${f.provider.name} · ${f.provider.document || "—"}`],
    ["Inscrição municipal", f.provider.registration ?? "—"],
    ["Tomador (paciente)", `${f.customer.name} · ${f.customer.document || "—"}`],
    ["Código do serviço", f.serviceCode || "—"],
    ["Descrição", f.description],
    ["Valor", formatMoney(f.amountCents)],
    ["Data do pagamento", formatDate(f.date)],
    ...(f.issRate ? ([["ISS", `${f.issRate}${f.issCents != null ? ` (${formatMoney(f.issCents)})` : ""}`]] as [string, string][]) : []),
  ];
  return (
    <li className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {charge.patient.name} <span className="font-normal text-slate-500">· {formatMoney(charge.amountCents)}</span>
        </p>
        <p className="text-xs text-slate-500">Pedida em {formatDate(invoice.requestedAt)}</p>
      </div>
      {missing.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Falta no cadastro: {missing.join(", ")}.
        </p>
      )}
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[11rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd className="select-all">{value}</dd>
          </div>
        ))}
      </dl>
      {canIssue && focusConfigured() && <AutomaticIssue invoice={invoice} missing={missing} />}
      {canIssue ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-marinho-700">
            {focusConfigured() ? "Emiti por fora do sistema: anotar o número" : "Já emiti: anotar o número"}
          </summary>
          <ActionForm action={markInvoiceIssued.bind(null, invoice.id)} submitLabel="Anotar nota" className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor={`n-${invoice.id}`}>Número da nota *</label>
              <input className="input" id={`n-${invoice.id}`} name="number" required />
            </div>
            <div>
              <label className="label" htmlFor={`c-${invoice.id}`}>Código de verificação</label>
              <input className="input" id={`c-${invoice.id}`} name="verificationCode" />
            </div>
            <div>
              <label className="label" htmlFor={`d-${invoice.id}`}>Emitida em</label>
              <input type="date" className="input" id={`d-${invoice.id}`} name="issuedAt" defaultValue={dateInput(today())} />
            </div>
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">
            Emita no <a href={NFSE_EMISSOR_URL} target="_blank" rel="noreferrer" className="text-marinho-700 underline">emissor nacional da NFS-e</a> com
            os dados acima e depois anote o número aqui.
          </p>
        </details>
      ) : (
        <p className="text-sm text-slate-500">Aguardando {professional?.name ?? "o profissional"} emitir a nota.</p>
      )}
    </li>
  );
}
