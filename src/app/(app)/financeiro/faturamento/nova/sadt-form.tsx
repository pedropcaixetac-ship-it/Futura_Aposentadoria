"use client";

import { useState } from "react";
import { formatMoney, moneyInput, parseMoney } from "@/lib/money";
import { formatTussCode } from "@/lib/convenios";
import { accidentIndications, cboSuggestions, MAX_CLAIM_ITEMS, serviceTypes } from "@/lib/tiss";
import { ActionForm } from "../../action-form";
import type { FormState } from "../../actions";

type Price = { tussCode: string; description: string; priceCents: number };
type Row = { key: number; tussCode: string; quantity: string; unit: string };

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  prices: Price[];
  defaults: { cardNumber: string; cardValidUntil: string; serviceDate: string; cbo: string };
};

// Formulário da guia SP/SADT: uma linha por exame ou procedimento, com o valor da tabela do convênio.
export function SadtForm({ action, prices, defaults }: Props) {
  const [rows, setRows] = useState<Row[]>([{ key: 0, tussCode: "", quantity: "1", unit: "" }]);
  const total = rows.reduce((t, r) => t + (parseMoney(r.unit) ?? 0) * (Number(r.quantity) || 0), 0);

  function update(key: number, change: Partial<Row>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }
  function choose(key: number, tussCode: string) {
    const price = prices.find((p) => p.tussCode === tussCode);
    update(key, { tussCode, ...(price && { unit: moneyInput(price.priceCents) }) });
  }

  return (
    <ActionForm action={action} submitLabel="Gerar guia SP/SADT" resetOnSuccess={false}>
      <h3 className="font-semibold">Dados do beneficiário</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="cardNumber">Nº da carteirinha *</label>
          <input className="input" id="cardNumber" name="cardNumber" defaultValue={defaults.cardNumber} required />
        </div>
        <div>
          <label className="label" htmlFor="cardValidUntil">Validade da carteirinha</label>
          <input className="input" id="cardValidUntil" name="cardValidUntil" type="date" defaultValue={defaults.cardValidUntil} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="newborn" className="h-4 w-4 accent-marinho-700" /> Recém-nascido na carteirinha da mãe
        </label>
      </div>

      <h3 className="pt-2 font-semibold">Pedido e autorização</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="requestDate">Data do pedido</label>
          <input className="input" id="requestDate" name="requestDate" type="date" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="clinicalIndication">Indicação clínica</label>
          <input className="input" id="clinicalIndication" name="clinicalIndication" maxLength={500} placeholder="Motivo do exame, como está no pedido" />
        </div>
        <div>
          <label className="label" htmlFor="operatorNumber">Nº da guia no convênio</label>
          <input className="input" id="operatorNumber" name="operatorNumber" maxLength={20} placeholder="Se o convênio autorizou antes" />
        </div>
        <div>
          <label className="label" htmlFor="authorizationCode">Senha da autorização</label>
          <input className="input" id="authorizationCode" name="authorizationCode" maxLength={20} />
        </div>
        <div>
          <label className="label" htmlFor="authorizationDate">Data da autorização</label>
          <input className="input" id="authorizationDate" name="authorizationDate" type="date" />
        </div>
      </div>

      <h3 className="pt-2 font-semibold">Atendimento</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="serviceDate">Data da realização *</label>
          <input className="input" id="serviceDate" name="serviceDate" type="date" defaultValue={defaults.serviceDate} required />
        </div>
        <div>
          <label className="label" htmlFor="serviceType">Tipo de atendimento *</label>
          <select className="input" id="serviceType" name="serviceType" defaultValue="23">
            {serviceTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="accidentIndication">Acidente?</label>
          <select className="input" id="accidentIndication" name="accidentIndication" defaultValue={9}>
            {accidentIndications.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cbo">CBO do profissional *</label>
          <input className="input" id="cbo" name="cbo" list="cbo-list" defaultValue={defaults.cbo} inputMode="numeric" placeholder="Ex.: 225125" required />
          <datalist id="cbo-list">
            {cboSuggestions.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </datalist>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="urgent" className="h-4 w-4 accent-marinho-700" /> Urgência ou emergência
        </label>
      </div>

      <h3 className="pt-2 font-semibold">Exames e procedimentos</h3>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.key} className="grid items-end gap-2 sm:grid-cols-[3fr_5rem_8rem_auto]">
            <div>
              <label className="label" htmlFor={`item_tuss_${i}`}>Procedimento {i + 1}</label>
              <select className="input" id={`item_tuss_${i}`} name={`item_tuss_${i}`} value={row.tussCode} onChange={(e) => choose(row.key, e.target.value)}>
                <option value="">Escolha o procedimento</option>
                {prices.map((p) => <option key={p.tussCode} value={p.tussCode}>{formatTussCode(p.tussCode)} · {p.description}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`item_qtd_${i}`}>Qtd.</label>
              <input className="input" id={`item_qtd_${i}`} name={`item_qtd_${i}`} value={row.quantity} onChange={(e) => update(row.key, { quantity: e.target.value })} inputMode="numeric" />
            </div>
            <div>
              <label className="label" htmlFor={`item_valor_${i}`}>Valor (R$)</label>
              <input className="input" id={`item_valor_${i}`} name={`item_valor_${i}`} value={row.unit} onChange={(e) => update(row.key, { unit: e.target.value })} inputMode="decimal" />
            </div>
            <button
              type="button"
              className="btn-secondary px-3!"
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              aria-label={`Tirar o procedimento ${i + 1}`}
            >
              Tirar
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={rows.length >= MAX_CLAIM_ITEMS}
            onClick={() => setRows((current) => [...current, { key: Math.max(...current.map((r) => r.key)) + 1, tussCode: "", quantity: "1", unit: "" }])}
          >
            + Outro procedimento
          </button>
          <p className="text-sm">Total da guia: <span className="font-semibold text-marinho-800">{formatMoney(total)}</span></p>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="notes">Observação</label>
        <input className="input" id="notes" name="notes" maxLength={500} />
      </div>
    </ActionForm>
  );
}
