import { prisma } from "@/lib/db";
import { formatTime } from "@/lib/agenda";
import { formatDateTime } from "@/lib/format";
import { canWorkClinical } from "@/lib/permissions";
import { isPhysician } from "@/lib/pronto-socorro";
import { fluidDayStart } from "@/lib/internacao";
import { displayName } from "@/lib/staff";
import { doseState, doseTimes, FREQUENCIES, frequencyLabel, kindLabel, ROUTES, type DoseState } from "@/lib/prescricao";
import type { CurrentUser } from "@/lib/auth";
import { ActionForm } from "../financeiro/action-form";
import { addPrescriptionItem, cancelCheck, checkDose, suspendPrescriptionItem, type RxContext } from "./actions";
import { CheckForm } from "./check-form";
import { MedicationInput } from "./medication-search";

const tone: Record<DoseState, string> = {
  FEITO: "border-emerald-200 bg-emerald-50 text-emerald-800",
  NAO_FEITO: "border-slate-300 bg-slate-100 text-slate-700",
  ATRASADO: "border-red-300 bg-red-50 text-red-800",
  AGORA: "border-amber-300 bg-amber-50 text-amber-900",
  PREVISTO: "border-slate-200 bg-white text-slate-600",
};

function nowLocal() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 16);
}

const staff = { select: { name: true, sex: true, jobTitle: true } } as const;

// Prescrição do médico e checagem da enfermagem, igual na internação e no pronto-socorro.
// Mostra os horários do dia do plantão (7h às 7h).
export async function PrescriptionPanel({ ctx, user, open }: { ctx: RxContext; user: CurrentUser; open: boolean }) {
  const where = ctx.kind === "internacao" ? { admissionId: ctx.id } : { emergencyVisitId: ctx.id };
  const items = await prisma.prescriptionItem.findMany({
    where: { clinicId: user.clinicId, ...where },
    include: {
      prescriber: staff,
      suspendedBy: staff,
      checks: { include: { recordedBy: staff, canceledBy: staff }, orderBy: { at: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  const now = new Date();
  const dayStart = fluidDayStart(now);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
  const doctor = isPhysician(user);
  const nurse = canWorkClinical(user);
  const visible = items.filter((i) => !i.suspendedAt || i.suspendedAt >= dayStart);

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold text-marinho-800">Prescrição e checagem</h2>
        <p className="text-xs text-slate-500">
          Horários de {formatDateTime(dayStart)} a {formatDateTime(dayEnd)}. Amarelo: hora de fazer. Vermelho: atrasado (mais de 30 min).
        </p>
      </div>

      {visible.length === 0 && <p className="text-sm text-slate-500">Nada prescrito ainda.</p>}
      <ul className="space-y-3">
        {visible.map((item) => {
          const valid = item.checks.filter((c) => !c.canceledAt);
          const times = doseTimes(item, dayStart, dayEnd);
          const suspended = !!item.suspendedAt;
          const asNeededToday = item.asNeeded ? valid.filter((c) => !c.scheduledAt && c.at >= dayStart) : [];
          return (
            <li key={item.id} className="rounded-md border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className={suspended ? "text-slate-400 line-through" : ""}>
                  <span className="mr-2 rounded bg-marinho-50 px-1.5 py-0.5 text-xs text-marinho-800">{kindLabel[item.kind]}</span>
                  <strong>{item.description}</strong>
                  {[item.dose, item.route, frequencyLabel(item)].filter(Boolean).map((x) => ` · ${x}`)}
                  <span className="text-slate-500">
                    {" "}· desde {formatDateTime(item.startAt)}{item.endAt && ` até ${formatDateTime(item.endAt)}`} · {displayName(item.prescriber)}
                  </span>
                  {item.note && <p className="text-xs text-slate-600">{item.note}</p>}
                </div>
                {open && doctor && !suspended && (
                  <form action={suspendPrescriptionItem.bind(null, ctx, item.id)} className="flex items-center gap-1">
                    <input name="reason" className="input py-1! text-xs" placeholder="Motivo" />
                    <button className="text-xs text-red-700 hover:underline">Suspender</button>
                  </form>
                )}
              </div>
              {suspended && (
                <p className="text-xs text-red-700">
                  Suspenso {formatDateTime(item.suspendedAt)}{item.suspendedBy && ` por ${displayName(item.suspendedBy)}`}: {item.suspendReason}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                {times.map((t) => {
                  const check = valid.find((c) => c.scheduledAt?.getTime() === t.getTime());
                  const state = doseState(t, check, now);
                  // Só dá para checar o que já está na hora (até 30 minutos antes) ou atrasado.
                  if (!check && open && nurse && !suspended && state !== "PREVISTO") {
                    return (
                      <CheckForm
                        key={t.toISOString()}
                        action={checkDose.bind(null, ctx, item.id, t.toISOString())}
                        label={formatTime(t)}
                        tone={tone[state]}
                      />
                    );
                  }
                  return (
                    <span key={t.toISOString()} className={`rounded-md border px-2 py-1 text-xs ${tone[state]}`} title={check?.note ?? undefined}>
                      <strong>{formatTime(t)}</strong>
                      {check ? ` ${check.status === "FEITO" ? "✓ feito" : "✗ não feito"} · ${displayName(check.recordedBy)} às ${formatTime(check.at)}${check.note ? ` · ${check.note}` : ""}` : state === "ATRASADO" ? " atrasado" : ""}
                    </span>
                  );
                })}
                {item.asNeeded && open && nurse && !suspended && (
                  <CheckForm action={checkDose.bind(null, ctx, item.id, null)} label="Dose se necessário" tone={tone.PREVISTO} />
                )}
                {asNeededToday.map((c) => (
                  <span key={c.id} className={`rounded-md border px-2 py-1 text-xs ${tone[c.status]}`}>
                    {formatTime(c.at)} {c.status === "FEITO" ? "✓ feito" : "✗ não feito"} · {displayName(c.recordedBy)}{c.note && ` · ${c.note}`}
                  </span>
                ))}
              </div>

              {open && nurse && valid.some((c) => c.at >= dayStart) && (
                <details className="mt-2 text-xs text-slate-500">
                  <summary className="cursor-pointer">Anular uma checagem errada</summary>
                  <ul className="mt-1 space-y-1">
                    {valid.filter((c) => c.at >= dayStart).map((c) => (
                      <li key={c.id}>
                        <form action={cancelCheck.bind(null, ctx, c.id)} className="flex flex-wrap items-center gap-1">
                          <span>{c.scheduledAt ? formatTime(c.scheduledAt) : formatTime(c.at)} · {displayName(c.recordedBy)}</span>
                          <input name="reason" required className="rounded border border-slate-300 px-1 py-0.5" placeholder="Motivo" />
                          <button className="text-red-700 hover:underline">Anular</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {item.checks.some((c) => c.canceledAt) && (
                <p className="mt-1 text-xs text-slate-400">
                  {item.checks.filter((c) => c.canceledAt).map((c) => (
                    <span key={c.id} className="mr-2 line-through">{c.scheduledAt ? formatTime(c.scheduledAt) : formatTime(c.at)} anulada ({c.cancelReason})</span>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {open && doctor && (
        <ActionForm action={addPrescriptionItem.bind(null, ctx)} submitLabel="Prescrever" className="space-y-3 rounded-md bg-marinho-50 p-3">
          <h3 className="text-sm font-semibold text-marinho-800">Novo item</h3>
          <div className="grid gap-3 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="kind">Tipo</label>
              <select className="input" id="kind" name="kind" defaultValue="MEDICAMENTO">
                {Object.entries(kindLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="sm:col-span-4">
              <label className="label" htmlFor="description">Medicamento ou cuidado *</label>
              <MedicationInput id="description" name="description" routeFieldId="route" placeholder="Digite o nome do medicamento (ex.: dipirona) ou um cuidado" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="dose">Dose</label>
              <input className="input" id="dose" name="dose" placeholder="Ex.: 2 mL diluído em 10 mL AD" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="route">Via</label>
              <select className="input" id="route" name="route" defaultValue="">
                <option value="">—</option>
                {ROUTES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="frequency">Frequência</label>
              <select className="input" id="frequency" name="frequency" defaultValue="unica">
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="startAt">Primeira dose</label>
              <input className="input" id="startAt" name="startAt" type="datetime-local" defaultValue={nowLocal()} />
            </div>
            <div>
              <label className="label" htmlFor="days">Dias</label>
              <input className="input" id="days" name="days" type="number" min={1} max={30} placeholder="—" />
            </div>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="note">Observação</label>
              <input className="input" id="note" name="note" placeholder="Ex.: se dor ou febre acima de 37,8 °C; correr em 30 minutos" />
            </div>
          </div>
        </ActionForm>
      )}
    </section>
  );
}
