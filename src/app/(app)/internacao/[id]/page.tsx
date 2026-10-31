import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canViewClinical } from "@/lib/permissions";
import { age, formatCpf, formatDate, formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { compareBedCodes, daysAdmitted, daysLabel, dischargeKindLabel } from "@/lib/internacao";
import { ActionForm } from "../../financeiro/action-form";
import { dischargePatient, transferBed } from "../actions";

function stayLabel(days: number) {
  return days === 0 ? "Alta no mesmo dia" : `Ficou ${daysLabel(days)} internado(a)`;
}

function nowLocal() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 16);
}

export default async function AdmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("internacao");
  const { id } = await params;
  const admission = await prisma.admission.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      patient: { select: { id: true, name: true, socialName: true, birthDate: true, cpf: true, allergies: true } },
      bed: { include: { ward: true } },
      attending: { select: { name: true, sex: true, jobTitle: true } },
      admittedBy: { select: { name: true, sex: true, jobTitle: true } },
      dischargedBy: { select: { name: true, sex: true, jobTitle: true } },
      movements: {
        include: { fromBed: { include: { ward: true } }, toBed: { include: { ward: true } }, movedBy: { select: { name: true, sex: true, jobTitle: true } } },
        orderBy: { movedAt: "desc" },
      },
    },
  });
  if (!admission) notFound();
  const clinical = canViewClinical(user);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "INTERNACAO_VISUALIZADA", entity: "Admission", entityId: admission.id, patientId: admission.patient.id });

  const open = !admission.dischargedAt;
  const freeWards = open
    ? await prisma.ward.findMany({
        where: { clinicId: user.clinicId, active: true },
        include: { beds: { where: { active: true, status: "LIVRE", admissions: { none: { dischargedAt: null } } } } },
        orderBy: { name: "asc" },
      })
    : [];
  const years = age(admission.patient.birthDate);
  const bedName = (b: { code: string; ward: { name: string } }) => `${b.ward.name} · ${b.code}`;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/internacao" className="text-sm text-marinho-700 hover:underline">← Mapa de leitos</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{admission.patient.socialName || admission.patient.name}</h1>
          {open ? (
            <span className="rounded-full bg-marinho-700 px-2 py-0.5 text-xs text-white">Internado(a) · {bedName(admission.bed)}</span>
          ) : (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{dischargeKindLabel[admission.dischargeKind!]} em {formatDateTime(admission.dischargedAt)}</span>
          )}
        </div>
        <p className="text-sm text-slate-500">
          {[years !== null && `${years} anos`, admission.patient.birthDate && `nascimento ${formatDate(admission.patient.birthDate)}`, admission.patient.cpf && `CPF ${formatCpf(admission.patient.cpf)}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {admission.patient.allergies && clinical && (
          <p className="mt-1 inline-block rounded-md bg-red-50 px-2 py-1 text-sm font-medium text-red-700">Alergias: {admission.patient.allergies}</p>
        )}
      </div>

      <section className="card grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Internação</p>
          <p className="font-medium">{formatDateTime(admission.admittedAt)}</p>
          <p className="text-slate-500">{open ? daysLabel(daysAdmitted(admission.admittedAt)) : stayLabel(daysAdmitted(admission.admittedAt, admission.dischargedAt!))}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Médico responsável</p>
          <p className="font-medium">{displayName(admission.attending)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Veio de</p>
          <p className="font-medium">{admission.origin}</p>
          {admission.insurance && <p className="text-slate-500">{admission.insurance}</p>}
        </div>
        {clinical && (admission.reason || admission.cidCode) && (
          <div className="sm:col-span-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Motivo</p>
            {admission.cidCode && <p className="font-medium">{admission.cidCode} {admission.cidDescription}</p>}
            {admission.reason && <p className="whitespace-pre-line">{admission.reason}</p>}
          </div>
        )}
        {!open && clinical && admission.dischargeNote && (
          <div className="sm:col-span-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Resumo da alta · {admission.dischargedBy && displayName(admission.dischargedBy)}</p>
            <p className="whitespace-pre-line">{admission.dischargeNote}</p>
          </div>
        )}
        <div className="sm:col-span-3">
          <Link href={`/pacientes/${admission.patient.id}`} className="text-marinho-700 hover:underline">Abrir ficha e prontuário do paciente</Link>
        </div>
      </section>

      {open && (
        <div className="grid gap-4 md:grid-cols-2">
          <ActionForm action={transferBed.bind(null, admission.id)} submitLabel="Trocar de leito">
            <h2 className="font-semibold text-marinho-800">Trocar de leito</h2>
            <p className="text-sm text-slate-500">O leito atual vai para limpeza.</p>
            <div>
              <label className="label" htmlFor="bedId">Novo leito</label>
              <select className="input" id="bedId" name="bedId" defaultValue="" required>
                <option value="" disabled>Escolha um leito livre</option>
                {freeWards.filter((w) => w.beds.length).map((w) => (
                  <optgroup key={w.id} label={w.name}>
                    {[...w.beds].sort((a, b) => compareBedCodes(a.code, b.code)).map((b) => <option key={b.id} value={b.id}>{w.name} · {b.code}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="note">Motivo</label>
              <input className="input" id="note" name="note" placeholder="Ex.: pedido de isolamento, vaga na UTI" />
            </div>
          </ActionForm>

          {clinical ? (
            <ActionForm action={dischargePatient.bind(null, admission.id)} submitLabel="Registrar alta" resetOnSuccess={false}>
              <h2 className="font-semibold text-marinho-800">Alta</h2>
              <div>
                <label className="label" htmlFor="dischargeKind">Tipo</label>
                <select className="input" id="dischargeKind" name="dischargeKind" defaultValue="" required>
                  <option value="" disabled>Escolha</option>
                  {Object.entries(dischargeKindLabel).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="dischargedAt">Data e hora</label>
                <input className="input" id="dischargedAt" name="dischargedAt" type="datetime-local" defaultValue={nowLocal()} required />
              </div>
              <div>
                <label className="label" htmlFor="dischargeNote">Resumo da alta</label>
                <textarea className="input min-h-24" id="dischargeNote" name="dischargeNote" placeholder="Diagnóstico, evolução, orientações e receitas de alta" />
              </div>
            </ActionForm>
          ) : (
            <p className="card text-sm text-slate-500">A alta é registrada pelo médico ou outro profissional de saúde com registro em conselho.</p>
          )}
        </div>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">Histórico de leitos</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {admission.movements.map((m) => (
            <li key={m.id} className="py-2">
              <span className="font-medium">{formatDateTime(m.movedAt)}</span>{" "}
              {m.fromBed ? `${bedName(m.fromBed)} → ${bedName(m.toBed)}` : `Entrou no leito ${bedName(m.toBed)}`}
              <span className="text-slate-500"> · {displayName(m.movedBy)}{m.note && ` · ${m.note}`}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">Internado(a) por {displayName(admission.admittedBy)}.</p>
      </section>
    </div>
  );
}
