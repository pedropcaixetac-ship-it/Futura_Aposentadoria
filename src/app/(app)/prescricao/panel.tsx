import { prisma } from "@/lib/db";
import { formatTime } from "@/lib/agenda";
import { formatDateTime } from "@/lib/format";
import { canWorkClinical } from "@/lib/permissions";
import { isPhysician } from "@/lib/pronto-socorro";
import { displayName } from "@/lib/staff";
import Link from "next/link";
import { dayFromKey, dayKey, dayWindow, doseState, doseTimes, FREQUENCIES, frequencyLabel, inDay, isDailyItem, kindLabel, localMidnight, prescriptionDayEnd, prescriptionDayOf, prescriptionDays, repeatableFromPreviousDay, ROUTES, type DoseState } from "@/lib/prescricao";
import type { CurrentUser } from "@/lib/auth";
import { ActionForm } from "../financeiro/action-form";
import { addPrescriptionItem, cancelCheck, checkDose, repeatPreviousDay, suspendPrescriptionItem, type RxContext } from "./actions";
import { CheckForm } from "./check-form";
import { MedicationInput } from "./medication-search";
import { RecordActions } from "../assinatura/record-actions";

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

const weekday = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function dayLabel(start: Date) {
  const local = new Date(start.getTime() - 3 * 3600 * 1000);
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  return `${weekday[local.getUTCDay()]} ${dd}/${mm}/${local.getUTCFullYear()}`;
}

// Prescrição do médico e checagem da enfermagem, igual na internação e no pronto-socorro.
// Cada prescrição vale um dia de plantão (7h às 7h). Ao lado, a lista de todos os dias:
// clicando num dia, abre a prescrição daquele dia (só para consulta).
export async function PrescriptionPanel({ ctx, user, open, day }: { ctx: RxContext; user: CurrentUser; open: boolean; day?: string }) {
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
  const today = localMidnight(now);
  const chosen = dayFromKey(day);
  const days = prescriptionDays(items, today);
  const dayStart = chosen && days.some((d) => d.start.getTime() === chosen.getTime()) ? chosen : today;
  const isToday = dayStart.getTime() === today.getTime();
  // Dias anteriores ficam só para consulta: checar, suspender e prescrever é sempre na tela de hoje.
  const editable = open && isToday;
  const doctor = isPhysician(user);
  const nurse = canWorkClinical(user);
  // Hoje também aparece o que a prescrição de ontem ainda cobre (até as 12h), para a enfermagem checar a manhã.
  const carried = isToday ? items.filter((i) => isDailyItem(i) && !inDay(i, dayStart) && i.endAt! > now && i.startAt < now) : [];
  const visible = [...carried, ...items.filter((i) => inDay(i, dayStart))];
  const windowOf = (item: (typeof items)[number]) => (carried.includes(item) ? dayWindow(item, prescriptionDayOf(item)) : dayWindow(item, dayStart));
  const toRepeat = editable && doctor ? repeatableFromPreviousDay(items, today).length : 0;
  const validUntil = prescriptionDayEnd(dayStart);
  // O que a própria pessoa fez neste dia e pode assinar: a prescrição (médico) e as checagens (enfermagem).
  const key = `${ctx.kind}:${ctx.id}:${dayKey(dayStart)}:${user.id}`;
  const prescribedToday = items.some((i) => i.prescriberId === user.id && !carried.includes(i) && inDay(i, dayStart) && isDailyItem(i));
  const dayEndMs = dayStart.getTime() + 24 * 3600_000;
  const checkedToday = items.some((i) => i.checks.some((c) => c.recordedById === user.id && c.at >= dayStart && c.at.getTime() < dayEndMs));
  const back = ctx.kind === "internacao" ? `/internacao/${ctx.id}/prescricao` : `/pronto-socorro/${ctx.id}`;

  return (
    <section id="prescricao" className="card grid scroll-mt-4 gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-marinho-800">
            Prescrição de {dayLabel(dayStart)}{isToday ? " (hoje)" : ""}
          </h2>
          <p className="text-xs text-slate-500">
            Vale até {formatDateTime(validUntil)}. Amarelo: hora de fazer. Vermelho: atrasado (mais de 30 min).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/api/pdf/prescricao/${ctx.kind}/${ctx.id}/${dayKey(dayStart)}`} target="_blank" className="btn-secondary px-3! py-1.5! text-sm">PDF do dia</a>
          {!isToday && (
            <Link href="?#prescricao" className="text-sm text-marinho-700 hover:underline">Voltar para hoje</Link>
          )}
        </div>
      </div>
      {(prescribedToday || checkedToday) && (
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-slate-200 px-3 py-2 text-sm">
          {prescribedToday && (
            <span className="flex flex-wrap items-center gap-2">Minha prescrição deste dia: <RecordActions user={user} type="prescricao" recordKey={key} back={back} signLabel="Assinar prescrição" /></span>
          )}
          {checkedToday && (
            <span className="flex flex-wrap items-center gap-2">Minhas checagens deste dia: <RecordActions user={user} type="enfermagem" recordKey={key} back={back} signLabel="Assinar checagens" /></span>
          )}
        </div>
      )}
      {!isToday && <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">Prescrição de outro dia, só para consulta.</p>}

      {toRepeat > 0 && (
        <ActionForm action={repeatPreviousDay.bind(null, ctx)} submitLabel={`Repetir a prescrição de ontem (${toRepeat} ${toRepeat === 1 ? "item" : "itens"})`} className="rounded-md border border-dourado-300 bg-dourado-100 p-3">
          <p className="text-sm text-marinho-900">
            Repita a prescrição de ontem e depois suspenda ou acrescente o que mudou. Os horários continuam depois das 12h, quando a de ontem deixa de valer.
          </p>
        </ActionForm>
      )}

      {visible.length === 0 && (
        <p className="text-sm text-slate-500">
          {isToday && items.length > 0 ? "Ainda não há prescrição para hoje." : "Nada prescrito neste dia."}
        </p>
      )}
      <ul className="space-y-3">
        {visible.map((item) => {
          const [from, to] = windowOf(item);
          const inThisDay = (at: Date) => at >= from && at < to;
          const valid = item.checks.filter((c) => !c.canceledAt);
          const times = doseTimes(item, from, to);
          const suspended = !!item.suspendedAt;
          const fromYesterday = carried.includes(item);
          const asNeededToday = item.asNeeded ? valid.filter((c) => !c.scheduledAt && inThisDay(c.at)) : [];
          return (
            <li key={item.id} className={`rounded-md border p-3 text-sm ${fromYesterday ? "border-dashed border-slate-300 bg-slate-50" : "border-slate-200"}`}>
              {fromYesterday && <p className="mb-1 text-xs font-medium text-slate-500">Da prescrição de ontem, vale até {formatTime(item.endAt!)}</p>}
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
                {editable && doctor && !suspended && (
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
                  if (!check && editable && nurse && !suspended && state !== "PREVISTO") {
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
                      {check ? ` ${check.status === "FEITO" ? "✓ feito" : "✗ não feito"} · ${displayName(check.recordedBy)} às ${formatTime(check.at)}${check.note ? ` · ${check.note}` : ""}` : state === "ATRASADO" ? (isToday ? " atrasado" : " sem checagem") : ""}
                    </span>
                  );
                })}
                {item.asNeeded && editable && nurse && !suspended && (
                  <CheckForm action={checkDose.bind(null, ctx, item.id, null)} label="Dose se necessário" tone={tone.PREVISTO} />
                )}
                {asNeededToday.map((c) => (
                  <span key={c.id} className={`rounded-md border px-2 py-1 text-xs ${tone[c.status]}`}>
                    {formatTime(c.at)} {c.status === "FEITO" ? "✓ feito" : "✗ não feito"} · {displayName(c.recordedBy)}{c.note && ` · ${c.note}`}
                  </span>
                ))}
              </div>

              {editable && nurse && valid.some((c) => inThisDay(c.at)) && (
                <details className="mt-2 text-xs text-slate-500">
                  <summary className="cursor-pointer">Anular uma checagem errada</summary>
                  <ul className="mt-1 space-y-1">
                    {valid.filter((c) => inThisDay(c.at)).map((c) => (
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
              {item.checks.some((c) => c.canceledAt && inThisDay(c.at)) && (
                <p className="mt-1 text-xs text-slate-400">
                  {item.checks.filter((c) => c.canceledAt && inThisDay(c.at)).map((c) => (
                    <span key={c.id} className="mr-2 line-through">{c.scheduledAt ? formatTime(c.scheduledAt) : formatTime(c.at)} anulada ({c.cancelReason})</span>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {editable && doctor && (
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
            <div className="sm:col-span-4">
              <label className="label" htmlFor="note">Observação</label>
              <input className="input" id="note" name="note" placeholder="Ex.: se dor ou febre acima de 37,8 °C; correr em 30 minutos" />
            </div>
          </div>
        </ActionForm>
      )}
      </div>

      <aside className="space-y-3 lg:border-l lg:border-slate-200 lg:pl-4">
        <h3 className="text-sm font-semibold text-marinho-800">Prescrições por dia</h3>
        <form action="#prescricao" className="flex gap-1">
          <input type="date" name="dia" defaultValue={dayKey(dayStart)} aria-label="Ir para o dia" className="input py-1! text-sm" />
          <button className="btn-secondary px-2! py-1! text-sm">Ver</button>
        </form>
        {days.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhuma prescrição ainda.</p>
        ) : (
          <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-auto rounded-md border border-slate-200 text-sm">
            {days.map((d) => {
              const selected = d.start.getTime() === dayStart.getTime();
              return (
                <li key={d.key}>
                  <Link
                    href={d.start.getTime() === today.getTime() ? "?#prescricao" : `?dia=${d.key}#prescricao`}
                    className={`flex items-center justify-between gap-2 px-3 py-2 ${selected ? "bg-marinho-700 text-white" : "hover:bg-marinho-50"}`}
                  >
                    <span>
                      {dayLabel(d.start)}
                      {d.start.getTime() === today.getTime() && <span className={`ml-1 text-xs ${selected ? "text-dourado-300" : "text-dourado-700"}`}>hoje</span>}
                    </span>
                    <span className={`text-xs ${selected ? "text-white/80" : "text-slate-500"}`}>
                      {d.count === 0 ? "sem itens" : `${d.count} ${d.count === 1 ? "item" : "itens"}`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </section>
  );
}
