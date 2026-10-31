import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { vitalFields, type Vitals } from "@/lib/vitals";
import { ActionForm } from "../../../financeiro/action-form";
import { addVitals, cancelCareRecord } from "../../actions";
import { CareHeader, CareNav } from "../care-nav";
import { loadAdmissionForCare, nowLocal } from "../care-data";
import { RecordActions } from "../../../assinatura/record-actions";
import { dayKey, localMidnight } from "@/lib/prescricao";

// Altura não muda na internação; o resto é aferido várias vezes por dia.
const fields = vitalFields.filter((f) => f.key !== "altura");

export default async function VitalsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("internacao");
  const { id } = await params;
  const admission = await loadAdmissionForCare(user, id);
  const records = await prisma.vitalRecord.findMany({
    where: { clinicId: user.clinicId, admissionId: admission.id },
    include: { recordedBy: { select: { name: true, sex: true, jobTitle: true } }, canceledBy: { select: { name: true, sex: true, jobTitle: true } } },
    orderBy: { takenAt: "desc" },
  });

  return (
    <div className="max-w-6xl space-y-6">
      <CareHeader admission={admission} />
      <CareNav admissionId={admission.id} current="sinais" />
      {/* Assinatura dos registros de enfermagem de hoje (checagens, sinais vitais e balanço). */}
      {records.some((r) => r.recordedById === user.id && r.takenAt >= localMidnight(new Date())) && (
        <div className="card flex flex-wrap items-center gap-3 py-3! text-sm">
          Meus registros de hoje (checagens, sinais vitais e balanço):
          <RecordActions user={user} type="enfermagem" recordKey={`internacao:${admission.id}:${dayKey(localMidnight(new Date()))}:${user.id}`} back={`/internacao/${admission.id}`} signLabel="Assinar registros" />
        </div>
      )}

      {!admission.dischargedAt && (
        <ActionForm action={addVitals.bind(null, admission.id)} submitLabel="Registrar sinais vitais">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <div className="col-span-2">
              <label className="label" htmlFor="takenAt">Aferido em</label>
              <input className="input" id="takenAt" name="takenAt" type="datetime-local" defaultValue={nowLocal()} required />
            </div>
            {fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`vital_${f.key}`}>
                  {f.short} <span className="text-slate-400">({f.unit})</span>
                </label>
                <input className="input" id={`vital_${f.key}`} name={`vital_${f.key}`} inputMode="decimal" />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="pain">Dor <span className="text-slate-400">(0 a 10)</span></label>
              <input className="input" id="pain" name="pain" type="number" min={0} max={10} />
            </div>
            <div className="col-span-2 sm:col-span-4 lg:col-span-6">
              <label className="label" htmlFor="note">Observação</label>
              <input className="input" id="note" name="note" placeholder="Ex.: após antitérmico, em ar ambiente" />
            </div>
          </div>
        </ActionForm>
      )}

      <section className="card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Quando</th>
              {fields.map((f) => <th key={f.key} className="px-3 py-2">{f.short}</th>)}
              <th className="px-3 py-2">Dor</th>
              <th className="px-3 py-2">Quem</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.length === 0 && (
              <tr><td colSpan={fields.length + 4} className="px-3 py-6 text-center text-slate-500">Nenhum sinal vital registrado.</td></tr>
            )}
            {records.map((r) => {
              const v = r.vitals as Vitals;
              const canceled = !!r.canceledAt;
              return (
                <tr key={r.id} className={canceled ? "text-slate-400 line-through" : ""}>
                  <td className="whitespace-nowrap px-3 py-2">{formatDateTime(r.takenAt)}</td>
                  {fields.map((f) => <td key={f.key} className="px-3 py-2">{v[f.key]?.toLocaleString("pt-BR") ?? ""}</td>)}
                  <td className="px-3 py-2">{r.pain ?? ""}</td>
                  <td className="px-3 py-2 no-underline">
                    {displayName(r.recordedBy)}
                    {r.note && <span className="block text-xs text-slate-500">{r.note}</span>}
                    {canceled && <span className="block text-xs no-underline">Anulado por {displayName(r.canceledBy!)}: {r.cancelReason}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {!canceled && !admission.dischargedAt && (
                      <form action={cancelCareRecord.bind(null, "sinais", r.id)} className="flex gap-1">
                        <input className="input h-8! w-36! py-1! text-xs" name="reason" required placeholder="Motivo" aria-label="Motivo da anulação" />
                        <button className="text-xs text-red-700 hover:underline">Anular</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
