import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isPhysician } from "@/lib/pronto-socorro";
import { DOSE_UNITS, protocolDrugs } from "@/lib/quimio";
import { ActionForm } from "../../financeiro/action-form";
import { saveProtocol } from "../actions";
import { ChemoNav } from "../nav";

export default async function ProtocolsPage() {
  const user = await requireUser("quimioterapia");
  const protocols = await prisma.chemoProtocol.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } });

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Quimioterapia</h1>
        <p className="text-sm text-slate-500">Protocolos da instituição. A dose de cada medicamento é calculada para o paciente quando o tratamento começa.</p>
      </div>
      <ChemoNav current="protocolos" />

      <section className="card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Protocolo</th><th className="px-3 py-2">Ciclo</th><th className="px-3 py-2">Medicamentos</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {protocols.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">Nenhum protocolo cadastrado.</td></tr>}
            {protocols.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="px-3 py-2 font-medium">{p.name}{p.note && <span className="block text-xs font-normal text-slate-500">{p.note}</span>}</td>
                <td className="px-3 py-2">a cada {p.cycleDays} dias</td>
                <td className="px-3 py-2">
                  {protocolDrugs(p.drugs).map((d, i) => (
                    <p key={i}>{d.drug} {d.dose.toLocaleString("pt-BR")} {d.unit} {d.route} · D{d.days.join(", D")}</p>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isPhysician(user) ? (
        <ActionForm action={saveProtocol} submitLabel="Cadastrar protocolo">
          <h2 className="font-semibold text-marinho-800">Novo protocolo</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="name">Nome</label>
              <input className="input" id="name" name="name" required placeholder="Ex.: AC (doxorrubicina + ciclofosfamida)" />
            </div>
            <div>
              <label className="label" htmlFor="cycleDays">Ciclo a cada (dias)</label>
              <input className="input" id="cycleDays" name="cycleDays" type="number" min={1} max={365} defaultValue={21} required />
            </div>
            <div>
              <label className="label" htmlFor="note">Observação</label>
              <input className="input" id="note" name="note" placeholder="Ex.: pré-medicação com ondansetrona" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Medicamentos (dias do ciclo: &quot;1&quot;, &quot;1, 8&quot; ou &quot;1-5&quot;)</p>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
                <input className="input" name={`drug${i}`} placeholder="Medicamento" aria-label={`Medicamento ${i + 1}`} />
                <input className="input" name={`dose${i}`} inputMode="decimal" placeholder="Dose" aria-label={`Dose ${i + 1}`} />
                <select className="input" name={`unit${i}`} defaultValue="mg/m²" aria-label={`Unidade ${i + 1}`}>
                  {DOSE_UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
                <input className="input" name={`route${i}`} defaultValue="EV" aria-label={`Via ${i + 1}`} />
                <input className="input" name={`days${i}`} placeholder="Dias" defaultValue={i === 0 ? "1" : ""} aria-label={`Dias ${i + 1}`} />
              </div>
            ))}
          </div>
        </ActionForm>
      ) : (
        <p className="text-sm text-slate-500">Só médico (CRM) cadastra protocolos.</p>
      )}
    </div>
  );
}
