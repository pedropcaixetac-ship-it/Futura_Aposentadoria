import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canWorkInfectionControl } from "@/lib/hospital-roles";
import { formatDate, formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { compareBedCodes } from "@/lib/internacao";
import { frequencyLabel } from "@/lib/prescricao";
import { DEVICES, infectionDensity, isAntimicrobial, isolationHint, isolationLabel, isolationStyle, needsReview, patientDays, siteLabel, therapyDay } from "@/lib/ccih";
import { ActionForm } from "../financeiro/action-form";
import { cancelInfection, endIsolation, reportInfection, startIsolation } from "./actions";

const BRT = 3 * 3600_000;

// Mês atual em Brasília: [início, agora].
function monthRange(now = new Date()) {
  const local = new Date(now.getTime() - BRT);
  const from = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + BRT);
  return { from, label: local.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }) };
}

export default async function CcihPage() {
  const user = await requireUser("ccih");
  const ccihTeam = canWorkInfectionControl(user);
  const now = new Date();
  const { from, label } = monthRange(now);
  const monthStart = new Date(from.getTime() - BRT);

  const [open, monthAdmissions, isolations, infections, antimicrobials] = await Promise.all([
    prisma.admission.findMany({
      where: { clinicId: user.clinicId, dischargedAt: null },
      select: { id: true, patient: { select: { name: true, socialName: true } }, bed: { select: { code: true, ward: { select: { name: true } } } } },
    }),
    prisma.admission.findMany({
      where: { clinicId: user.clinicId, admittedAt: { lt: now }, OR: [{ dischargedAt: null }, { dischargedAt: { gt: from } }] },
      select: { admittedAt: true, dischargedAt: true },
    }),
    prisma.isolationPrecaution.findMany({
      where: { clinicId: user.clinicId, endedAt: null },
      include: {
        admission: { select: { patient: { select: { name: true, socialName: true } }, bed: { select: { code: true, ward: { select: { name: true } } } } } },
        startedBy: { select: { name: true, sex: true, jobTitle: true } },
      },
      orderBy: { startedAt: "asc" },
    }),
    prisma.hospitalInfection.findMany({
      where: { clinicId: user.clinicId, diagnosedAt: { gte: new Date(monthStart.getTime() - 60 * 24 * 3600_000) } },
      include: {
        admission: { select: { id: true, patient: { select: { name: true, socialName: true } }, bed: { select: { code: true, ward: { select: { name: true } } } } } },
        reportedBy: { select: { name: true, sex: true, jobTitle: true } },
      },
      orderBy: { diagnosedAt: "desc" },
    }),
    prisma.prescriptionItem.findMany({
      where: {
        clinicId: user.clinicId,
        kind: "MEDICAMENTO",
        suspendedAt: null,
        startAt: { lte: now },
        OR: [{ endAt: null }, { endAt: { gt: now } }],
        AND: [{ OR: [{ admission: { dischargedAt: null } }, { emergencyVisit: { closedAt: null } }] }],
      },
      include: {
        patient: { select: { name: true, socialName: true } },
        prescriber: { select: { name: true, sex: true, jobTitle: true } },
        admission: { select: { id: true, bed: { select: { code: true, ward: { select: { name: true } } } } } },
      },
      orderBy: { startAt: "asc" },
    }),
  ]);
  const name = (p: { name: string; socialName: string | null }) => p.socialName || p.name;
  const bedName = (b: { code: string; ward: { name: string } }) => `${b.ward.name} · ${b.code}`;
  const beds = [...open].sort((a, b) => a.bed.ward.name.localeCompare(b.bed.ward.name) || compareBedCodes(a.bed.code, b.bed.code));
  const atb = antimicrobials.filter((i) => isAntimicrobial(i.description));
  const valid = infections.filter((i) => !i.canceledAt);
  const thisMonth = valid.filter((i) => i.diagnosedAt.getTime() >= monthStart.getTime());
  const days = patientDays(monthAdmissions, from, now);
  const bySite = Object.entries(siteLabel)
    .map(([site, text]) => [text, thisMonth.filter((i) => i.site === site).length] as const)
    .filter(([, n]) => n > 0);
  const admissionOptions = beds.map((a) => <option key={a.id} value={a.id}>{bedName(a.bed)} · {name(a.patient)}</option>);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">CCIH</h1>
        <p className="text-sm text-slate-500">Controle de infecção hospitalar: isolamentos, antimicrobianos em uso e infecções notificadas.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card"><p className="text-sm text-slate-500">Em isolamento</p><p className="text-2xl font-semibold text-marinho-800">{isolations.length}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Em uso de antimicrobiano</p><p className="text-2xl font-semibold text-marinho-800">{new Set(atb.map((i) => i.patientId)).size}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Infecções em {label}</p><p className="text-2xl font-semibold text-marinho-800">{thisMonth.length}</p></div>
        <div className="card">
          <p className="text-sm text-slate-500">Densidade no mês</p>
          <p className="text-2xl font-semibold text-marinho-800">{infectionDensity(thisMonth.length, days).toLocaleString("pt-BR")}</p>
          <p className="text-xs text-slate-500">por 1.000 pacientes-dia ({days} pacientes-dia)</p>
        </div>
      </div>
      {bySite.length > 0 && <p className="text-sm text-slate-600">No mês: {bySite.map(([t, n]) => `${t}: ${n}`).join(" · ")}</p>}

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">Isolamentos ativos</h2>
        {isolations.length === 0 && <p className="text-sm text-slate-500">Nenhum paciente em isolamento.</p>}
        <ul className="space-y-3">
          {isolations.map((i) => (
            <li key={i.id} className="rounded-md border border-slate-200 p-3 text-sm">
              <p>
                <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${isolationStyle[i.kind]}`}>{isolationLabel[i.kind]}</span>
                <strong>{name(i.admission.patient)}</strong> <span className="text-slate-500">· {bedName(i.admission.bed)}</span>
              </p>
              <p className="text-slate-600">{i.reason} · desde {formatDateTime(i.startedAt)} · {displayName(i.startedBy)}</p>
              <p className="text-xs text-slate-500">{isolationHint[i.kind]}</p>
              {ccihTeam && (
              <ActionForm action={endIsolation.bind(null, i.id)} submitLabel="Encerrar isolamento" className="mt-2 flex flex-wrap items-end gap-2">
                <input name="endReason" className="input w-auto! min-w-64" placeholder="Motivo (ex.: culturas negativas)" aria-label="Motivo do encerramento" />
              </ActionForm>
              )}
            </li>
          ))}
        </ul>
        {beds.length > 0 && ccihTeam && (
          <ActionForm action={startIsolation} submitLabel="Colocar em isolamento" className="space-y-3 border-t border-slate-100 pt-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="iso-admission">Paciente</label>
                <select className="input" id="iso-admission" name="admissionId" defaultValue="" required>
                  <option value="" disabled>Escolha</option>
                  {admissionOptions}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="iso-kind">Tipo</label>
                <select className="input" id="iso-kind" name="kind" defaultValue="CONTATO">
                  {Object.entries(isolationLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="iso-reason">Germe ou motivo</label>
                <input className="input" id="iso-reason" name="reason" required placeholder="Ex.: KPC em swab retal" />
              </div>
            </div>
          </ActionForm>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">Antimicrobianos em uso ({atb.length})</h2>
        {atb.length === 0 && <p className="text-sm text-slate-500">Nenhum antimicrobiano prescrito agora.</p>}
        {atb.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr><th className="py-1 pr-3">Paciente</th><th className="py-1 pr-3">Antimicrobiano</th><th className="py-1 pr-3">Dia</th><th className="py-1 pr-3">Término</th><th className="py-1">Prescrito por</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {atb.map((i) => (
                  <tr key={i.id}>
                    <td className="py-1.5 pr-3">
                      {i.admission ? <Link href={`/internacao/${i.admission.id}/prescricao`} className="text-marinho-700 hover:underline">{name(i.patient)}</Link> : name(i.patient)}
                      <span className="block text-xs text-slate-500">{i.admission ? bedName(i.admission.bed) : "Pronto-socorro"}</span>
                    </td>
                    <td className="py-1.5 pr-3">{i.description}<span className="block text-xs text-slate-500">{[i.dose, i.route, frequencyLabel(i)].filter(Boolean).join(" · ")}</span></td>
                    <td className="py-1.5 pr-3 font-medium">D{therapyDay(i.startAt, now)}{needsReview(i, now) && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">revisar</span>}</td>
                    <td className="py-1.5 pr-3">{i.endAt ? formatDate(i.endAt) : <span className="text-amber-700">sem data</span>}</td>
                    <td className="py-1.5">{displayName(i.prescriber)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">&quot;Revisar&quot;: 7 dias ou mais de uso sem data de término.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">Infecções notificadas (últimos meses)</h2>
        {infections.length === 0 && <p className="text-sm text-slate-500">Nenhuma infecção notificada.</p>}
        <ul className="space-y-3">
          {infections.map((i) => (
            <li key={i.id} className={`rounded-md border border-slate-200 p-3 text-sm ${i.canceledAt ? "opacity-60" : ""}`}>
              <p>
                <strong>{siteLabel[i.site]}</strong> · {formatDate(i.diagnosedAt)} · <Link href={`/internacao/${i.admission.id}`} className="text-marinho-700 hover:underline">{name(i.admission.patient)}</Link>
              </p>
              <p className="text-slate-600">{[i.organism, i.device, i.note].filter(Boolean).join(" · ") || "Sem detalhes"} · {displayName(i.reportedBy)}</p>
              {i.canceledAt ? (
                <p className="text-xs text-slate-500">Anulada: {i.cancelReason}</p>
              ) : ccihTeam ? (
                <ActionForm action={cancelInfection.bind(null, i.id)} submitLabel="Anular" className="mt-2 flex flex-wrap items-end gap-2">
                  <input name="reason" className="input w-auto! min-w-64" placeholder="Motivo da anulação" aria-label="Motivo da anulação" />
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
        {beds.length > 0 && ccihTeam && (
          <ActionForm action={reportInfection} submitLabel="Notificar infecção" className="space-y-3 border-t border-slate-100 pt-3">
            <h3 className="font-medium">Notificar infecção</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="inf-admission">Paciente</label>
                <select className="input" id="inf-admission" name="admissionId" defaultValue="" required>
                  <option value="" disabled>Escolha</option>
                  {admissionOptions}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="inf-site">Infecção</label>
                <select className="input" id="inf-site" name="site" defaultValue="ICS">
                  {Object.entries(siteLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="inf-date">Data do diagnóstico</label>
                <input className="input" id="inf-date" name="diagnosedAt" type="date" required />
              </div>
              <div>
                <label className="label" htmlFor="inf-organism">Germe</label>
                <input className="input" id="inf-organism" name="organism" placeholder="Ex.: Klebsiella pneumoniae" />
              </div>
              <div>
                <label className="label" htmlFor="inf-device">Dispositivo</label>
                <select className="input" id="inf-device" name="device" defaultValue="Nenhum">
                  {DEVICES.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="inf-note">Observação</label>
                <input className="input" id="inf-note" name="note" />
              </div>
            </div>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
