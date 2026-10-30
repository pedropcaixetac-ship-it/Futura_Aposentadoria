import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateInput, today } from "@/lib/finance";
import { staffFunction, terminationReasons, displayName, staffEditBlock } from "@/lib/staff";
import { ActionForm } from "../../../financeiro/action-form";
import { terminateStaff } from "../../actions";

export default async function TerminationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("servidores");
  const { id } = await params;
  const staff = await prisma.user.findFirst({ where: { id, clinicId: user.clinicId }, omit: { passwordHash: true } });
  if (!staff) notFound();
  if (staffEditBlock(user, staff)) redirect("/servidores");
  if (!staff.active || staff.id === user.id) redirect("/servidores");

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Link href="/servidores" className="text-sm text-marinho-700 hover:underline">← Cadastro de servidores</Link>
        <h1 className="text-2xl font-semibold">Registrar desligamento</h1>
        <p className="text-sm text-slate-500">{displayName(staff)} · {staffFunction(staff)}</p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        A pessoa perde o acesso ao sistema na hora e sai de onde estiver conectada. O cadastro não é apagado:
        os atendimentos e documentos que ela assinou continuam no prontuário com o nome dela.
        Se precisar, dá para reativar depois pelo menu da tabela.
      </div>

      <ActionForm action={terminateStaff.bind(null, staff.id)} submitLabel="Confirmar desligamento" resetOnSuccess={false}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="terminatedAt">Data do desligamento *</label>
            <input className="input" id="terminatedAt" name="terminatedAt" type="date" defaultValue={dateInput(today())} required />
          </div>
          <div>
            <label className="label" htmlFor="reason">Motivo *</label>
            <select className="input" id="reason" name="reason" defaultValue="" required>
              <option value="" disabled>Escolha...</option>
              {terminationReasons.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="notes">Observações</label>
          <textarea className="input" id="notes" name="notes" rows={3} />
        </div>
      </ActionForm>
    </div>
  );
}
