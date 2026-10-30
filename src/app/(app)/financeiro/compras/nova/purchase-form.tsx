"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { formatMoney, moneyInput, parseMoney } from "@/lib/money";
import { dateInput, purchaseKinds, splitInstallments } from "@/lib/finance";
import { parseNfe } from "@/lib/nfe";
import { itemTotal, parseQuantity } from "@/lib/purchase";
import { createPurchase, type FormState } from "../../actions";

type Item = { description: string; unit: string; quantity: string; unitPrice: string; total?: string; batch: string; expiresAt: string };
type Installment = { dueDate: string; amount: string };

type Props = {
  suppliers: { name: string; cnpj: string | null }[];
  paymentMethods: { value: string; label: string }[];
  today: string;
};

const emptyItem = (): Item => ({ description: "", unit: "", quantity: "", unitPrice: "", batch: "", expiresAt: "" });

function lineTotal(item: Item) {
  if (item.total) return parseMoney(item.total) ?? 0;
  const q = parseQuantity(item.quantity);
  const u = parseMoney(item.unitPrice);
  return q && u !== null ? itemTotal(q, u) : 0;
}

export function PurchaseForm({ suppliers, paymentMethods, today }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createPurchase, { error: "" });
  const [notice, setNotice] = useState("");

  const [supplierName, setSupplierName] = useState("");
  const [supplierCnpj, setSupplierCnpj] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceSeries, setInvoiceSeries] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  // Enquanto ninguém digitar o total, ele acompanha a soma dos itens.
  const [total, setTotal] = useState("");
  const [totalTouched, setTotalTouched] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(1);
  const [firstDue, setFirstDue] = useState(today);
  const [installments, setInstallments] = useState<Installment[] | null>(null);
  const [paidNow, setPaidNow] = useState(false);

  const itemsSum = useMemo(() => items.reduce((t, i) => t + lineTotal(i), 0), [items]);
  const totalValue = totalTouched ? total : itemsSum ? moneyInput(itemsSum) : "";
  const totalCents = parseMoney(totalValue) ?? 0;

  // Parcelas calculadas (iguais, a cada 30 dias), a menos que tenham vindo do XML ou sido editadas.
  const parcels: Installment[] =
    installments ??
    (() => {
      const first = new Date(`${firstDue || today}T00:00:00Z`);
      return splitInstallments(totalCents, installmentCount, first).map((p) => ({
        dueDate: dateInput(p.dueDate),
        amount: totalCents ? moneyInput(p.amountCents) : "",
      }));
    })();
  const parcelsSum = parcels.reduce((t, p) => t + (parseMoney(p.amount) ?? 0), 0);

  function updateItem(index: number, patch: Partial<Item>) {
    // Ao mexer na quantidade ou no valor, o total da linha volta a ser calculado.
    setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch, ...(("quantity" in patch || "unitPrice" in patch) && { total: undefined }) } : item)));
  }

  function pickSupplier(name: string) {
    setSupplierName(name);
    const known = suppliers.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
    if (known?.cnpj && !supplierCnpj) setSupplierCnpj(known.cnpj);
  }

  async function importXml(file: File | undefined) {
    if (!file) return;
    const nfe = parseNfe(await file.text());
    if (!nfe) {
      setNotice("Este arquivo não parece ser o XML de uma nota fiscal eletrônica (NF-e).");
      return;
    }
    setSupplierName(nfe.supplierName);
    setSupplierCnpj(nfe.supplierCnpj);
    setInvoiceNumber(nfe.invoiceNumber);
    setInvoiceSeries(nfe.invoiceSeries);
    setAccessKey(nfe.accessKey);
    if (nfe.issueDate) setIssueDate(nfe.issueDate);
    setItems(
      nfe.items.length
        ? nfe.items.map((i) => ({
            description: i.description,
            unit: i.unit,
            quantity: String(i.quantity).replace(".", ","),
            unitPrice: moneyInput(i.unitPriceCents),
            total: moneyInput(i.totalCents),
            batch: i.batch,
            expiresAt: i.expiresAt,
          }))
        : [emptyItem()],
    );
    setTotal(moneyInput(nfe.totalCents));
    setTotalTouched(true);
    if (nfe.installments.length) {
      setInstallmentCount(nfe.installments.length);
      setFirstDue(nfe.installments[0].dueDate);
      setInstallments(nfe.installments.map((p) => ({ dueDate: p.dueDate, amount: moneyInput(p.amountCents) })));
    } else {
      setInstallments(null);
    }
    setNotice(
      `Nota ${nfe.invoiceNumber} de ${nfe.supplierName} lida: ${nfe.items.length} ${nfe.items.length === 1 ? "item" : "itens"}, ` +
        `total ${formatMoney(nfe.totalCents)}. Confira os dados, escolha o tipo da compra e salve.`,
    );
  }

  return (
    // Envio manual para o que foi digitado não ser apagado quando aparece um aviso de erro.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="space-y-5"
    >
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <input type="hidden" name="installments" value={JSON.stringify(parcels)} />
      <input type="hidden" name="total" value={totalValue} />

      <div className="card space-y-2 border-dashed border-dourado-400 bg-dourado-50/40">
        <p className="font-medium text-marinho-800">Tem o arquivo XML da nota?</p>
        <p className="text-sm text-slate-600">
          O fornecedor manda o XML junto com o PDF (DANFE), geralmente por e-mail. Escolhendo o arquivo, o sistema preenche
          fornecedor, número, itens, lote, validade, total e parcelas sozinho.
        </p>
        <input
          type="file"
          accept=".xml,text/xml,application/xml"
          onChange={(e) => importXml(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-marinho-700 file:px-3 file:py-1.5 file:text-white"
        />
        {notice && <p className="rounded-md bg-white px-3 py-2 text-sm text-marinho-800">{notice}</p>}
      </div>

      <div className="card space-y-4">
        <h3 className="font-semibold text-marinho-800">Dados da nota</h3>
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <label className="label" htmlFor="supplierName">Fornecedor *</label>
            <input
              className="input"
              id="supplierName"
              name="supplierName"
              list="suppliers"
              value={supplierName}
              onChange={(e) => pickSupplier(e.target.value)}
              placeholder="Nome ou razão social"
              required
            />
            <datalist id="suppliers">
              {suppliers.map((s) => (
                <option key={s.name} value={s.name} />
              ))}
            </datalist>
          </div>
          <div className="sm:col-span-3">
            <label className="label" htmlFor="supplierCnpj">CNPJ do fornecedor</label>
            <input className="input" id="supplierCnpj" name="supplierCnpj" value={supplierCnpj} onChange={(e) => setSupplierCnpj(e.target.value)} inputMode="numeric" placeholder="00.000.000/0000-00" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="invoiceNumber">Número da NF *</label>
            <input className="input" id="invoiceNumber" name="invoiceNumber" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required />
          </div>
          <div className="sm:col-span-1">
            <label className="label" htmlFor="invoiceSeries">Série</label>
            <input className="input" id="invoiceSeries" name="invoiceSeries" value={invoiceSeries} onChange={(e) => setInvoiceSeries(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <label className="label" htmlFor="issueDate">Data de emissão *</label>
            <input className="input" id="issueDate" name="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
          </div>
          <div className="sm:col-span-3">
            <label className="label" htmlFor="kind">Tipo da compra *</label>
            <select className="input" id="kind" name="kind" defaultValue="" required>
              <option value="" disabled>Escolha...</option>
              {Object.keys(purchaseKinds).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="label" htmlFor="accessKey">Chave de acesso (44 números)</label>
            <input className="input" id="accessKey" name="accessKey" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} inputMode="numeric" />
          </div>
        </div>
      </div>

      <div className="card space-y-3 overflow-x-auto">
        <h3 className="font-semibold text-marinho-800">Itens da nota</h3>
        <p className="text-sm text-slate-500">Lote e validade são importantes para medicamentos e insumos.</p>
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Produto</th>
              <th className="w-20 py-1 pr-2 font-medium">Unid.</th>
              <th className="w-24 py-1 pr-2 font-medium">Qtd.</th>
              <th className="w-28 py-1 pr-2 font-medium">Valor unit.</th>
              <th className="w-28 py-1 pr-2 text-right font-medium">Total</th>
              <th className="w-28 py-1 pr-2 font-medium">Lote</th>
              <th className="w-36 py-1 pr-2 font-medium">Validade</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="align-top">
                <td className="py-1 pr-2">
                  <input className="input" aria-label={`Produto ${i + 1}`} value={item.description} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder="Ex.: Luva de procedimento M" />
                </td>
                <td className="py-1 pr-2">
                  <input className="input" aria-label={`Unidade ${i + 1}`} value={item.unit} onChange={(e) => updateItem(i, { unit: e.target.value })} placeholder="CX" />
                </td>
                <td className="py-1 pr-2">
                  <input className="input" aria-label={`Quantidade ${i + 1}`} value={item.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} inputMode="decimal" />
                </td>
                <td className="py-1 pr-2">
                  <input className="input" aria-label={`Valor unitário ${i + 1}`} value={item.unitPrice} onChange={(e) => updateItem(i, { unitPrice: e.target.value })} inputMode="decimal" placeholder="0,00" />
                </td>
                <td className="whitespace-nowrap py-3 pr-2 text-right font-medium">{formatMoney(lineTotal(item))}</td>
                <td className="py-1 pr-2">
                  <input className="input" aria-label={`Lote ${i + 1}`} value={item.batch} onChange={(e) => updateItem(i, { batch: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input className="input" type="date" aria-label={`Validade ${i + 1}`} value={item.expiresAt} onChange={(e) => updateItem(i, { expiresAt: e.target.value })} />
                </td>
                <td className="py-1">
                  {items.length > 1 && (
                    <button type="button" onClick={() => setItems((list) => list.filter((_, j) => j !== i))} className="px-2 py-2 text-slate-400 hover:text-red-600" aria-label={`Remover item ${i + 1}`}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setItems((list) => [...list, emptyItem()])} className="btn-secondary">
            + Adicionar item
          </button>
          <p className="text-sm text-slate-600">Soma dos itens: <strong>{formatMoney(itemsSum)}</strong></p>
        </div>
      </div>

      <div className="card space-y-4">
        <h3 className="font-semibold text-marinho-800">Valor e pagamento</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="totalInput">Valor total da nota (R$) *</label>
            <input
              className="input"
              id="totalInput"
              value={totalValue}
              onChange={(e) => {
                setTotal(e.target.value);
                setTotalTouched(true);
                setInstallments(null);
              }}
              inputMode="decimal"
              placeholder="0,00"
              required
            />
            {itemsSum > 0 && totalCents !== itemsSum && (
              <p className="mt-1 text-xs text-slate-500">Diferente da soma dos itens (frete, desconto ou impostos?).</p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="installmentCount">Parcelas</label>
            <select
              className="input"
              id="installmentCount"
              value={installmentCount}
              onChange={(e) => {
                setInstallmentCount(Number(e.target.value));
                setInstallments(null);
              }}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n === 1 ? "À vista (1x)" : `${n}x`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="firstDue">Primeiro vencimento</label>
            <input
              className="input"
              id="firstDue"
              type="date"
              value={firstDue}
              onChange={(e) => {
                setFirstDue(e.target.value);
                setInstallments(null);
              }}
            />
          </div>
        </div>

        <div className="rounded-md bg-marinho-50 p-3">
          <p className="mb-2 text-sm text-slate-600">Cada parcela entra na aba Despesas, com o seu vencimento. Dá para ajustar datas e valores:</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {parcels.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-10 shrink-0 text-slate-500">{i + 1}/{parcels.length}</span>
                <input
                  type="date"
                  className="input"
                  aria-label={`Vencimento da parcela ${i + 1}`}
                  value={p.dueDate}
                  onChange={(e) => setInstallments(parcels.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))}
                />
                <input
                  className="input w-28 shrink-0"
                  aria-label={`Valor da parcela ${i + 1}`}
                  inputMode="decimal"
                  value={p.amount}
                  onChange={(e) => setInstallments(parcels.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                />
              </div>
            ))}
          </div>
          {totalCents > 0 && parcelsSum !== totalCents && (
            <p className="mt-2 text-sm text-red-700">
              As parcelas somam {formatMoney(parcelsSum)}, mas a nota é de {formatMoney(totalCents)}.
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="paidNow" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} className="h-4 w-4 accent-marinho-700" />
          Esta nota já foi paga
        </label>
        {paidNow && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Forma de pagamento</label>
              <select name="paymentMethod" className="input" defaultValue="" required>
                <option value="" disabled>Escolha...</option>
                {paymentMethods.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Data do pagamento</label>
              <input type="date" name="paidAt" className="input" defaultValue={today} />
            </div>
          </div>
        )}

        <div>
          <label className="label" htmlFor="notes">Observação</label>
          <input className="input" id="notes" name="notes" placeholder="Ex.: pedido 552, entregue por João" />
        </div>
      </div>

      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>
        {pending ? "Salvando..." : "Salvar nota fiscal"}
      </button>
    </form>
  );
}
