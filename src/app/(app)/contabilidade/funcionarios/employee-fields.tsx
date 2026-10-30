import type { Employee } from "@prisma/client";
import { formatCpf, formatPhone } from "@/lib/format";
import { dateInput } from "@/lib/finance";
import { moneyInput } from "@/lib/money";
import { employmentTypeLabel, employmentTypes } from "@/lib/accounting";

// Campos do cadastro de funcionário, usados no "novo" e no "editar".
export function EmployeeFields({ employee }: { employee?: Employee }) {
  const d = (date: Date | null | undefined) => (date ? dateInput(date) : "");
  return (
    <>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold text-marinho-800">Dados pessoais</legend>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">Nome completo *</label>
          <input className="input" id="name" name="name" defaultValue={employee?.name} required />
        </div>
        <div>
          <label className="label" htmlFor="cpf">CPF</label>
          <input className="input" id="cpf" name="cpf" inputMode="numeric" defaultValue={formatCpf(employee?.cpf)} placeholder="000.000.000-00" />
        </div>
        <div>
          <label className="label" htmlFor="pis">PIS / NIS</label>
          <input className="input" id="pis" name="pis" inputMode="numeric" defaultValue={employee?.pis ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="birthDate">Data de nascimento</label>
          <input className="input" id="birthDate" name="birthDate" type="date" defaultValue={d(employee?.birthDate)} />
        </div>
        <div>
          <label className="label" htmlFor="phone">Celular</label>
          <input className="input" id="phone" name="phone" inputMode="tel" defaultValue={formatPhone(employee?.phone)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="email">E-mail</label>
          <input className="input" id="email" name="email" type="email" defaultValue={employee?.email ?? ""} />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold text-marinho-800">Contrato</legend>
        <div>
          <label className="label" htmlFor="jobTitle">Função *</label>
          <input className="input" id="jobTitle" name="jobTitle" defaultValue={employee?.jobTitle} placeholder="Ex.: Recepcionista" required />
        </div>
        <div>
          <label className="label" htmlFor="sector">Setor</label>
          <input className="input" id="sector" name="sector" defaultValue={employee?.sector ?? ""} placeholder="Ex.: Recepção" />
        </div>
        <div>
          <label className="label" htmlFor="type">Tipo de vínculo *</label>
          <select className="input" id="type" name="type" defaultValue={employee?.type ?? "CLT"} required>
            {employmentTypes.map((t) => (
              <option key={t} value={t}>{employmentTypeLabel[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="admissionDate">Data de admissão *</label>
          <input className="input" id="admissionDate" name="admissionDate" type="date" defaultValue={d(employee?.admissionDate)} required />
        </div>
        <div>
          <label className="label" htmlFor="salary">Salário bruto (R$) *</label>
          <input className="input" id="salary" name="salary" inputMode="decimal" placeholder="0,00" defaultValue={employee ? moneyInput(employee.salaryCents) : ""} required />
        </div>
        <div>
          <label className="label" htmlFor="weeklyHours">Horas por semana</label>
          <input className="input" id="weeklyHours" name="weeklyHours" inputMode="numeric" placeholder="Ex.: 44" defaultValue={employee?.weeklyHours ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="paymentInfo">Chave Pix ou conta para o salário</label>
          <input className="input" id="paymentInfo" name="paymentInfo" defaultValue={employee?.paymentInfo ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">Observações</label>
          <textarea className="input" id="notes" name="notes" rows={2} defaultValue={employee?.notes ?? ""} />
        </div>
      </fieldset>
    </>
  );
}
