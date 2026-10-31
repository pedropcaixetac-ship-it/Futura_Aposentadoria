import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canIssueInvoice, canManageCharges, canManageFinance } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { displayName } from "@/lib/staff";
import { issuerLabel } from "@/lib/nfse";
import { ActionForm } from "../action-form";
import { updateInvoiceSettings } from "./actions";
import { PendingInvoice } from "./ui";

const chargeInclude = {
  patient: { select: { name: true, cpf: true } },
  professional: { select: { id: true, name: true, cpf: true, municipalRegistration: true, jobTitle: true, sex: true } },
} as const;

export default async function InvoicesPage() {
  const user = await requireUser("financeiro");
  if (!canManageCharges(user)) notFound();
  const admin = canManageFinance(user);
  const clinicId = user.clinicId;

  const [clinic, pending, issued] = await Promise.all([
    prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } }),
    prisma.serviceInvoice.findMany({
      where: { clinicId, status: "PEDIDA" },
      include: { charge: { include: chargeInclude } },
      orderBy: { requestedAt: "asc" },
    }),
    prisma.serviceInvoice.findMany({
      where: { clinicId, status: "EMITIDA" },
      include: { charge: { include: chargeInclude } },
      orderBy: { issuedAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Notas pedidas pelos pacientes</h2>
          <p className="text-sm text-slate-500">
            A nota só é feita quando o paciente pede. Na aba Receitas, use &quot;Pedir nota&quot; numa cobrança paga.
          </p>
        </div>
        <ul className="space-y-3">
          {pending.map((inv) => (
            <PendingInvoice
              key={inv.id}
              invoice={inv}
              issuer={inv.issuer}
              clinic={clinic}
              professional={inv.charge.professional ? { ...inv.charge.professional, name: displayName(inv.charge.professional) } : null}
              charge={inv.charge}
              canIssue={canIssueInvoice(user, inv, inv.charge)}
            />
          ))}
          {pending.length === 0 && <li className="card text-center text-sm text-slate-400">Nenhuma nota esperando emissão.</li>}
        </ul>

        <h2 className="pt-2 text-lg font-semibold">Últimas notas emitidas</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Emitida em</th>
                <th className="px-4 py-2 font-medium">Número</th>
                <th className="px-4 py-2 font-medium">Paciente</th>
                <th className="px-4 py-2 font-medium">Emissor</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {issued.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{formatDate(inv.issuedAt)}</td>
                  <td className="px-4 py-2 font-medium">{inv.number}</td>
                  <td className="px-4 py-2">{inv.charge.patient.name}</td>
                  <td className="px-4 py-2">
                    {inv.issuer === "CLINICA" ? "Clínica" : inv.charge.professional ? displayName(inv.charge.professional) : "Profissional"}
                  </td>
                  <td className="px-4 py-2 text-right">{formatMoney(inv.charge.amountCents)}</td>
                </tr>
              ))}
              {issued.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nenhuma nota emitida ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Como a clínica emite a nota</h2>
          <p className="text-sm text-slate-500">
            {admin ? "Na dúvida sobre quem deve emitir, confirme com o contador da clínica." : `Emissor: ${issuerLabel[clinic.invoiceIssuer]}.`}
          </p>
        </div>
        {admin && (
          <ActionForm action={updateInvoiceSettings} submitLabel="Salvar" resetOnSuccess={false}>
            <fieldset className="space-y-2">
              <legend className="label">Quem emite a nota</legend>
              {(["PROFISSIONAL", "CLINICA"] as const).map((value) => (
                <label key={value} className="flex items-start gap-2 text-sm">
                  <input type="radio" name="invoiceIssuer" value={value} defaultChecked={clinic.invoiceIssuer === value} className="mt-1 accent-marinho-700" />
                  <span>
                    {issuerLabel[value]}
                    <span className="block text-xs text-slate-500">
                      {value === "PROFISSIONAL"
                        ? "O profissional emite pelo CPF e informa a inscrição municipal em \"Meu financeiro\"."
                        : "A nota sai pelo CNPJ da clínica (o CNPJ fica em \"Preços e recibo\")."}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div>
              <label className="label" htmlFor="municipalRegistration">Inscrição municipal da clínica</label>
              <input className="input" id="municipalRegistration" name="municipalRegistration" defaultValue={clinic.municipalRegistration ?? ""} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="cityIbgeCode">Código IBGE da cidade</label>
                <input className="input" id="cityIbgeCode" name="cityIbgeCode" defaultValue={clinic.cityIbgeCode ?? ""} placeholder="Goiânia: 5208707" inputMode="numeric" />
              </div>
              <div>
                <label className="label" htmlFor="issRate">Alíquota do ISS (%)</label>
                <input className="input" id="issRate" name="issRate" defaultValue={clinic.issRateBasisPoints != null ? String(clinic.issRateBasisPoints / 100).replace(".", ",") : ""} placeholder="Ex.: 2" inputMode="decimal" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="serviceCode">Código do serviço</label>
              <input className="input" id="serviceCode" name="serviceCode" defaultValue={clinic.serviceCode ?? ""} placeholder="Medicina: 04.01.01" />
              <p className="mt-1 text-xs text-slate-500">Código da lista nacional de serviços. O contador confirma o código certo para cada especialidade.</p>
            </div>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
