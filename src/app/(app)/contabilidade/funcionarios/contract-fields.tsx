import type { EmploymentContract } from "@prisma/client";
import { dateInput } from "@/lib/finance";
import { moneyInput } from "@/lib/money";
import { employmentTypeLabel, employmentTypes } from "@/lib/accounting";

// Campos do contrato de trabalho. Nome, CPF, função e setor ficam no cadastro de servidores.
export function ContractFields({ contract }: { contract?: EmploymentContract | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="type">Tipo de vínculo *</label>
        <select className="input" id="type" name="type" defaultValue={contract?.type ?? "CLT"} required>
          {employmentTypes.map((t) => (
            <option key={t} value={t}>{employmentTypeLabel[t]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="admissionDate">Data de admissão *</label>
        <input className="input" id="admissionDate" name="admissionDate" type="date" defaultValue={contract ? dateInput(contract.admissionDate) : ""} required />
      </div>
      <div>
        <label className="label" htmlFor="salary">Salário bruto (R$) *</label>
        <input className="input" id="salary" name="salary" inputMode="decimal" placeholder="0,00" defaultValue={contract ? moneyInput(contract.salaryCents) : ""} required />
      </div>
      <div>
        <label className="label" htmlFor="weeklyHours">Horas por semana</label>
        <input className="input" id="weeklyHours" name="weeklyHours" inputMode="numeric" placeholder="Ex.: 44" defaultValue={contract?.weeklyHours ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="pis">PIS / NIS</label>
        <input className="input" id="pis" name="pis" inputMode="numeric" defaultValue={contract?.pis ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="paymentInfo">Chave Pix ou conta para o salário</label>
        <input className="input" id="paymentInfo" name="paymentInfo" defaultValue={contract?.paymentInfo ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">Observações</label>
        <textarea className="input" id="notes" name="notes" rows={2} defaultValue={contract?.notes ?? ""} />
      </div>
    </div>
  );
}
