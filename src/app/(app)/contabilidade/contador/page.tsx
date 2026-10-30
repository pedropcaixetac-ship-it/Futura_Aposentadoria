import { prisma } from "@/lib/db";
import { formatPhone, onlyDigits } from "@/lib/format";
import { monthRange } from "@/lib/finance";
import { taxRegimes } from "@/lib/accounting";
import { ActionForm } from "../../financeiro/action-form";
import { saveAccountant } from "../actions";
import { requireAccountingPage } from "../data";

export default async function AccountantPage() {
  const user = await requireAccountingPage();
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: user.clinicId } });
  const range = monthRange();
  const months = [monthRange(monthRange(range.prev).prev), monthRange(range.prev), range];
  const phone = onlyDigits(clinic.accountantPhone);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ActionForm action={saveAccountant} submitLabel="Salvar" resetOnSuccess={false}>
        <h2 className="font-semibold">Dados da clínica e do contador</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cnpj">CNPJ da clínica</label>
            <input className="input" id="cnpj" name="cnpj" inputMode="numeric" defaultValue={clinic.cnpj ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="taxRegime">Regime de impostos</label>
            <select className="input" id="taxRegime" name="taxRegime" defaultValue={clinic.taxRegime ?? ""}>
              <option value="">Não sei / a definir</option>
              {taxRegimes.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="accountantName">Contador ou escritório</label>
            <input className="input" id="accountantName" name="accountantName" defaultValue={clinic.accountantName ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="accountantEmail">E-mail</label>
            <input className="input" id="accountantEmail" name="accountantEmail" type="email" defaultValue={clinic.accountantEmail ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="accountantPhone">Telefone / WhatsApp</label>
            <input className="input" id="accountantPhone" name="accountantPhone" inputMode="tel" defaultValue={formatPhone(clinic.accountantPhone)} />
          </div>
        </div>
      </ActionForm>

      <div className="card space-y-4">
        <div>
          <h2 className="font-semibold">Planilha do mês para o contador</h2>
          <p className="text-sm text-slate-500">
            Uma planilha (abre no Excel) com tudo que entrou e saiu no mês, a folha de cada funcionário e as obrigações pagas. Baixe e mande
            para o contador junto com os extratos do banco.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {months.map((m) => (
            <a key={m.month} href={`/contabilidade/exportar?mes=${m.month}`} className={m.month === range.month ? "btn-primary" : "btn-secondary"}>
              Baixar {m.label}
            </a>
          ))}
        </div>
        {(clinic.accountantEmail || phone) && (
          <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-sm">
            {clinic.accountantEmail && (
              <a
                className="text-marinho-700 hover:underline"
                href={`mailto:${clinic.accountantEmail}?subject=${encodeURIComponent(`Documentos de ${monthRange(range.prev).label} - ${clinic.name}`)}`}
              >
                Escrever e-mail ao contador
              </a>
            )}
            {phone && (
              <a className="text-marinho-700 hover:underline" href={`https://wa.me/55${phone}`} target="_blank" rel="noreferrer">
                Abrir WhatsApp do contador
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
