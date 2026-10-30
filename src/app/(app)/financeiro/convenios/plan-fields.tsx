// Campos do cadastro do convênio, usados no "Novo convênio" e na edição.
export function PlanFields({ plan }: {
  plan?: { name: string; ansCode: string | null; providerCode: string | null; paymentDays: number | null; returnDays: number | null; notes: string | null };
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Nome do convênio *</label>
          <input className="input" id="name" name="name" defaultValue={plan?.name} placeholder="Ex.: Unimed Goiânia" required />
        </div>
        <div>
          <label className="label" htmlFor="ansCode">Registro ANS</label>
          <input className="input" id="ansCode" name="ansCode" defaultValue={plan?.ansCode ?? ""} inputMode="numeric" placeholder="6 números, está na carteirinha" />
        </div>
        <div>
          <label className="label" htmlFor="providerCode">Código da clínica no convênio</label>
          <input className="input" id="providerCode" name="providerCode" defaultValue={plan?.providerCode ?? ""} placeholder="Dado pelo convênio" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="paymentDays">Paga em (dias)</label>
            <input className="input" id="paymentDays" name="paymentDays" defaultValue={plan?.paymentDays ?? ""} inputMode="numeric" placeholder="Ex.: 30" />
          </div>
          <div>
            <label className="label" htmlFor="returnDays">Retorno em (dias)</label>
            <input className="input" id="returnDays" name="returnDays" defaultValue={plan?.returnDays ?? ""} inputMode="numeric" placeholder="Ex.: 30" />
          </div>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="notes">Observações</label>
        <textarea className="input" id="notes" name="notes" rows={2} defaultValue={plan?.notes ?? ""} placeholder="Ex.: exige autorização prévia para exames; portal www..." />
      </div>
    </>
  );
}
