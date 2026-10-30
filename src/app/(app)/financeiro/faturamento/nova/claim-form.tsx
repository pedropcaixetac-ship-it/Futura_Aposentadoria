"use client";

import { useState } from "react";
import { moneyInput } from "@/lib/money";
import { formatTussCode } from "@/lib/convenios";
import { accidentIndications, cboSuggestions, consultationTypes } from "@/lib/tiss";
import { ActionForm } from "../../action-form";
import type { FormState } from "../../actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  prices: { tussCode: string; description: string; priceCents: number }[];
  defaults: {
    cardNumber: string;
    cardValidUntil: string;
    serviceDate: string;
    consultationType: number;
    cbo: string;
    tussCode: string;
  };
};

// Formulário da guia de consulta: o valor vem da tabela do convênio ao escolher o procedimento.
export function ClaimForm({ action, prices, defaults }: Props) {
  const [tussCode, setTussCode] = useState(defaults.tussCode);
  const [amount, setAmount] = useState(() => {
    const price = prices.find((p) => p.tussCode === defaults.tussCode);
    return price ? moneyInput(price.priceCents) : "";
  });

  function choose(code: string) {
    setTussCode(code);
    const price = prices.find((p) => p.tussCode === code);
    if (price) setAmount(moneyInput(price.priceCents));
  }

  return (
    <ActionForm action={action} submitLabel="Gerar guia" resetOnSuccess={false}>
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

      <h3 className="pt-2 font-semibold">Atendimento</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="serviceDate">Data do atendimento *</label>
          <input className="input" id="serviceDate" name="serviceDate" type="date" defaultValue={defaults.serviceDate} required />
        </div>
        <div>
          <label className="label" htmlFor="consultationType">Tipo de consulta *</label>
          <select className="input" id="consultationType" name="consultationType" defaultValue={defaults.consultationType}>
            {consultationTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
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
          <p className="mt-1 text-xs text-slate-500">Código da profissão. Fica guardado para as próximas guias deste profissional.</p>
        </div>
        <div>
          <label className="label" htmlFor="operatorNumber">Nº da guia ou senha do convênio</label>
          <input className="input" id="operatorNumber" name="operatorNumber" placeholder="Se o convênio exigir autorização" />
        </div>
      </div>

      <h3 className="pt-2 font-semibold">Procedimento</h3>
      <div className="grid gap-4 sm:grid-cols-[3fr_1fr]">
        <div>
          <label className="label" htmlFor="tussCode">Procedimento *</label>
          <select className="input" id="tussCode" name="tussCode" value={tussCode} onChange={(e) => choose(e.target.value)} required>
            <option value="" disabled>Escolha o procedimento</option>
            {prices.map((p) => <option key={p.tussCode} value={p.tussCode}>{formatTussCode(p.tussCode)} · {p.description}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="amount">Valor (R$) *</label>
          <input className="input" id="amount" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="notes">Observação</label>
        <input className="input" id="notes" name="notes" maxLength={500} />
      </div>
    </ActionForm>
  );
}
