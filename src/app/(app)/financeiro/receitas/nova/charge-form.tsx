"use client";

import { startTransition, useActionState, useState } from "react";
import { moneyInput } from "@/lib/money";
import { createCharge, type FormState } from "../../actions";

type Props = {
  patientId: string;
  encounterId?: string;
  professionalId?: string;
  professionals: { id: string; name: string }[] | null;
  priceItems: { id: string; name: string; priceCents: number }[];
  paymentMethods: { value: string; label: string }[];
  today: string;
};

export function ChargeForm({ patientId, encounterId, professionalId, professionals, priceItems, paymentMethods, today }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createCharge, { error: "" });
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paidNow, setPaidNow] = useState(true);

  // Ao escolher um item da tabela de preços, o valor e a descrição vêm preenchidos.
  function pickPrice(id: string) {
    const item = priceItems.find((p) => p.id === id);
    if (!item) return;
    setAmount(moneyInput(item.priceCents));
    setDescription(item.name);
  }

  return (
    // Envio manual para o que foi digitado não ser apagado quando aparece um aviso de erro.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="card space-y-4"
    >
      <input type="hidden" name="patientId" value={patientId} />
      {encounterId && <input type="hidden" name="encounterId" value={encounterId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="priceItemId">Consulta ou procedimento</label>
          <select className="input" id="priceItemId" name="priceItemId" defaultValue="" onChange={(e) => pickPrice(e.target.value)}>
            <option value="">Outro (digitar abaixo)</option>
            {priceItems.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {(p.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</option>
            ))}
          </select>
        </div>
        {professionals ? (
          <div>
            <label className="label" htmlFor="professionalId">Profissional</label>
            <select className="input" id="professionalId" name="professionalId" defaultValue={professionalId ?? ""}>
              <option value="">Nenhum (não entra no repasse)</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div />
        )}
        <div>
          <label className="label" htmlFor="description">Descrição *</label>
          <input className="input" id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="amount">Valor (R$) *</label>
          <input className="input" id="amount" name="amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="dueDate">Vencimento</label>
          <input className="input" id="dueDate" name="dueDate" type="date" defaultValue={today} />
        </div>
        <div>
          <label className="label" htmlFor="notes">Observação</label>
          <input className="input" id="notes" name="notes" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="paidNow" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} className="h-4 w-4 accent-marinho-700" />
        O paciente já pagou
      </label>
      {paidNow && (
        <div className="grid gap-4 rounded-md bg-marinho-50 p-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="paymentMethod">Forma de pagamento *</label>
            <select className="input" id="paymentMethod" name="paymentMethod" defaultValue="" required>
              <option value="" disabled>Escolha...</option>
              {paymentMethods.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="paidAt">Data do pagamento</label>
            <input className="input" id="paidAt" name="paidAt" type="date" defaultValue={today} />
          </div>
        </div>
      )}

      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Salvando..." : paidNow ? "Salvar e registrar pagamento" : "Salvar cobrança"}</button>
    </form>
  );
}
