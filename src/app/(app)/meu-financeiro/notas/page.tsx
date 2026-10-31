import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canIssueInvoice } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { displayName } from "@/lib/staff";
import { issuerLabel } from "@/lib/nfse";
import { ActionForm } from "../../financeiro/action-form";
import { updateMyMunicipalRegistration } from "../../financeiro/notas/actions";
import { InvoiceNumber, PendingInvoice } from "../../financeiro/notas/ui";

// As notas fiscais dos atendimentos do próprio profissional: as pedidas e as já emitidas.
export default async function MyInvoicesPage() {
  const user = await requireUser("meu-financeiro");
  const mine = { charge: { professionalId: user.id } };
  const include = { charge: { include: { patient: { select: { name: true, cpf: true } } } } };

  const [clinic, me, pending, issued] = await Promise.all([
    prisma.clinic.findUniqueOrThrow({ where: { id: user.clinicId } }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, cpf: true, municipalRegistration: true, jobTitle: true, sex: true } }),
    prisma.serviceInvoice.findMany({ where: { clinicId: user.clinicId, ...mine, status: "PEDIDA" }, include, orderBy: { requestedAt: "asc" } }),
    prisma.serviceInvoice.findMany({ where: { clinicId: user.clinicId, ...mine, status: "EMITIDA" }, include, orderBy: { issuedAt: "desc" }, take: 50 }),
  ]);
  const professional = { ...me, name: displayName(me) };
  const selfEmployed = clinic.invoiceIssuer === "PROFISSIONAL";

  return (
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Notas pedidas pelos seus pacientes</h2>
          <p className="text-sm text-slate-500">
            Para anotar um pedido, use &quot;Pedir nota&quot; no pagamento, na aba Resumo.
          </p>
        </div>
        <ul className="space-y-3">
          {pending.map((inv) => (
            <PendingInvoice
              key={inv.id}
              invoice={inv}
              issuer={inv.issuer}
              clinic={clinic}
              professional={professional}
              charge={inv.charge}
              canIssue={canIssueInvoice(user, inv, inv.charge)}
            />
          ))}
          {pending.length === 0 && <li className="card text-center text-sm text-slate-400">Nenhuma nota esperando emissão.</li>}
        </ul>

        <h2 className="pt-2 text-lg font-semibold">Suas últimas notas emitidas</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Emitida em</th>
                <th className="px-4 py-2 font-medium">Número</th>
                <th className="px-4 py-2 font-medium">Paciente</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {issued.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{formatDate(inv.issuedAt)}</td>
                  <td className="px-4 py-2 font-medium"><InvoiceNumber invoice={inv} /></td>
                  <td className="px-4 py-2">{inv.charge.patient.name}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(inv.charge.amountCents)}</td>
                </tr>
              ))}
              {issued.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">Nenhuma nota emitida ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Quem emite</h2>
          <p className="text-sm text-slate-500">{issuerLabel[clinic.invoiceIssuer]}. Quem escolhe é o gerente da clínica.</p>
        </div>
        {selfEmployed && (
          <ActionForm action={updateMyMunicipalRegistration} submitLabel="Salvar" resetOnSuccess={false}>
            <div>
              <label className="label" htmlFor="municipalRegistration">Sua inscrição municipal (autônomo)</label>
              <input className="input" id="municipalRegistration" name="municipalRegistration" defaultValue={me.municipalRegistration ?? ""} />
              <p className="mt-1 text-xs text-slate-500">Aparece nos dados de cada nota emitida por você.</p>
            </div>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
