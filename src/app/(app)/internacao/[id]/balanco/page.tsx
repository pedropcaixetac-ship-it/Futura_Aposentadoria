import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { FLUID_IN, FLUID_OUT, fluidBalance, fluidDayStart, formatBalance } from "@/lib/internacao";
import { ActionForm } from "../../../financeiro/action-form";
import { addFluid, cancelCareRecord } from "../../actions";
import { CareHeader, CareNav } from "../care-nav";
import { loadAdmissionForCare, nowLocal } from "../care-data";
import { RecordActions } from "../../../assinatura/record-actions";
import { dayKey, localMidnight } from "@/lib/prescricao";

export default async function FluidBalancePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("internacao");
  const { id } = await params;
  const admission = await loadAdmissionForCare(user, id);
  const entries = await prisma.fluidEntry.findMany({
    where: { clinicId: user.clinicId, admissionId: admission.id },
    include: { recordedBy: { select: { name: true, sex: true, jobTitle: true } }, canceledBy: { select: { name: true, sex: true, jobTitle: true } } },
    orderBy: { at: "desc" },
  });

  // Um quadro por "dia" do balanço (7h às 7h), do mais recente para o mais antigo.
  const days = new Map<number, typeof entries>();
  for (const e of entries) {
    const key = fluidDayStart(e.at).getTime();
    days.set(key, [...(days.get(key) ?? []), e]);
  }

  return (
    <div className="max-w-5xl space-y-6">
      <CareHeader admission={admission} />
      <CareNav admissionId={admission.id} current="balanco" />
      {/* Assinatura dos registros de enfermagem de hoje (checagens, sinais vitais e balanço). */}
      {entries.some((r) => r.recordedById === user.id && r.at >= localMidnight(new Date())) && (
        <div className="card flex flex-wrap items-center gap-3 py-3! text-sm">
          Meus registros de hoje (checagens, sinais vitais e balanço):
          <RecordActions user={user} type="enfermagem" recordKey={`internacao:${admission.id}:${dayKey(localMidnight(new Date()))}:${user.id}`} back={`/internacao/${admission.id}`} signLabel="Assinar registros" />
        </div>
      )}

      {!admission.dischargedAt && (
        <div className="grid gap-4 md:grid-cols-2">
          {(["ENTRADA", "SAIDA"] as const).map((direction) => (
            <ActionForm key={direction} action={addFluid.bind(null, admission.id)} submitLabel={direction === "ENTRADA" ? "Registrar entrada" : "Registrar saída"}>
              <h2 className="font-semibold text-marinho-800">{direction === "ENTRADA" ? "Entrou" : "Saiu"}</h2>
              <input type="hidden" name="direction" value={direction} />
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label" htmlFor={`kind-${direction}`}>{direction === "ENTRADA" ? "O que entrou" : "O que saiu"}</label>
                  <select className="input" id={`kind-${direction}`} name="kind" required defaultValue="">
                    <option value="" disabled>Escolha</option>
                    {(direction === "ENTRADA" ? FLUID_IN : FLUID_OUT).map((k) => <option key={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor={`volume-${direction}`}>Volume (mL)</label>
                  <input className="input" id={`volume-${direction}`} name="volumeMl" type="number" min={1} max={10000} required />
                </div>
                <div>
                  <label className="label" htmlFor={`at-${direction}`}>Quando</label>
                  <input className="input" id={`at-${direction}`} name="at" type="datetime-local" defaultValue={nowLocal()} required />
                </div>
                <div className="col-span-2">
                  <label className="label" htmlFor={`note-${direction}`}>Observação</label>
                  <input className="input" id={`note-${direction}`} name="note" placeholder={direction === "ENTRADA" ? "Ex.: SF 0,9% 500 mL" : "Ex.: diurese concentrada"} />
                </div>
              </div>
            </ActionForm>
          ))}
        </div>
      )}

      {days.size === 0 && <p className="card text-sm text-slate-500">Nenhum lançamento de balanço hídrico.</p>}
      {[...days.entries()].map(([start, list]) => {
        const total = fluidBalance(list);
        return (
          <section key={start} className="card space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-marinho-800">Balanço de {formatDate(new Date(start))} 7h a {formatDate(new Date(start + 24 * 3600 * 1000))} 7h</h2>
              <p className="text-sm">
                Entrou <strong>{total.entrada.toLocaleString("pt-BR")} mL</strong> · Saiu <strong>{total.saida.toLocaleString("pt-BR")} mL</strong> ·{" "}
                <strong className={total.balanco >= 0 ? "text-marinho-800" : "text-red-700"}>Balanço {formatBalance(total.balanco)}</strong>
              </p>
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {list.map((e) => (
                <li key={e.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${e.canceledAt ? "text-slate-400" : ""}`}>
                  <span className={e.canceledAt ? "line-through" : ""}>
                    {formatDateTime(e.at)} · <strong>{e.direction === "ENTRADA" ? "+" : "−"}{e.volumeMl.toLocaleString("pt-BR")} mL</strong> {e.kind}
                    <span className="text-slate-500">{e.note && ` · ${e.note}`} · {displayName(e.recordedBy)}</span>
                  </span>
                  {e.canceledAt ? (
                    <span className="text-xs">Anulado por {displayName(e.canceledBy!)}: {e.cancelReason}</span>
                  ) : (
                    !admission.dischargedAt && (
                      <form action={cancelCareRecord.bind(null, "balanco", e.id)} className="flex gap-1">
                        <input className="input h-8! w-36! py-1! text-xs" name="reason" required placeholder="Motivo" aria-label="Motivo da anulação" />
                        <button className="text-xs text-red-700 hover:underline">Anular</button>
                      </form>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
