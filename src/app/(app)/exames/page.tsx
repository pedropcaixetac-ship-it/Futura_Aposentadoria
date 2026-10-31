import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { patientNameWhere } from "@/lib/patient";
import { isPhysician } from "@/lib/pronto-socorro";
import { displayName } from "@/lib/staff";
import { formatDate, formatDateTime } from "@/lib/format";
import { sectorLabel } from "@/lib/exames";
import { ActionForm } from "../financeiro/action-form";
import { cancelExam, scheduleExam } from "./actions";
import { ExamBadge } from "./status-badge";

// Recepção: agenda exames de laboratório e imagem (pedido do ambulatório ou de médico de fora).
export default async function ScheduleExamsPage({ searchParams }: { searchParams: Promise<{ q?: string; paciente?: string }> }) {
  const user = await requireUser("exames");
  const { q = "", paciente } = await searchParams;
  const term = q.trim();
  const digits = term.replace(/\D/g, "");
  const now = new Date();
  const [patient, results, types, doctors, upcoming] = await Promise.all([
    paciente ? prisma.patient.findFirst({ where: { id: paciente, clinicId: user.clinicId }, select: { id: true, name: true, socialName: true, birthDate: true, phone: true } }) : null,
    term.length >= 2
      ? prisma.patient.findMany({
          where: { clinicId: user.clinicId, OR: [patientNameWhere(term), ...(digits.length >= 3 ? [{ cpf: { contains: digits } }] : [])] },
          select: { id: true, name: true, birthDate: true },
          orderBy: { name: "asc" },
          take: 10,
        })
      : [],
    prisma.examType.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: [{ sector: "asc" }, { name: "asc" }] }),
    prisma.user.findMany({ where: { clinicId: user.clinicId, active: true, councilType: "CRM" }, select: { id: true, name: true, sex: true, jobTitle: true, role: true, councilNumber: true, councilType: true }, orderBy: { name: "asc" } }),
    prisma.examRequest.findMany({
      where: { clinicId: user.clinicId, status: "AGENDADO", scheduledAt: { gte: new Date(now.getTime() - 2 * 3600_000), lt: new Date(now.getTime() + 8 * 24 * 3600_000) } },
      include: { patient: { select: { name: true, socialName: true } }, examType: { select: { name: true, modality: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Agendar exames</h1>
        <p className="text-sm text-slate-500">O exame agendado aparece na fila do laboratório ou da imagem no dia marcado.</p>
      </div>

      {patient ? (
        <ActionForm action={scheduleExam.bind(null, patient.id)} submitLabel="Agendar exame">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{patient.socialName || patient.name}</p>
              {patient.birthDate && <p className="text-xs text-slate-500">nascimento {formatDate(patient.birthDate)}</p>}
            </div>
            <Link href="/exames" className="text-sm text-marinho-700 hover:underline">Trocar paciente</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="examTypeId">Exame</label>
              <select className="input" id="examTypeId" name="examTypeId" defaultValue="" required>
                <option value="" disabled>Escolha</option>
                {(["LABORATORIO", "IMAGEM"] as const).map((s) => (
                  <optgroup key={s} label={sectorLabel[s]}>
                    {types.filter((t) => t.sector === s).map((t) => <option key={t.id} value={t.id}>{t.name}{t.preparation ? ` (preparo: ${t.preparation})` : ""}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="scheduledAt">Dia e hora</label>
              <input className="input" id="scheduledAt" name="scheduledAt" type="datetime-local" step={900} required />
            </div>
            <div>
              <label className="label" htmlFor="requestedById">Médico do hospital que pediu</label>
              <select className="input" id="requestedById" name="requestedById" defaultValue="">
                <option value="">Médico de fora (escrever ao lado)</option>
                {doctors.filter(isPhysician).map((d) => <option key={d.id} value={d.id}>{displayName(d)}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="externalRequester">Médico de fora (nome e CRM)</label>
              <input className="input" id="externalRequester" name="externalRequester" placeholder="Ex.: Dr. Paulo Lima, CRM 12345/MG" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="clinicalInfo">Indicação (do pedido médico)</label>
              <input className="input" id="clinicalInfo" name="clinicalInfo" />
            </div>
          </div>
        </ActionForm>
      ) : (
        <div className="card space-y-3">
          <form className="flex gap-2">
            <input className="input" name="q" defaultValue={term} placeholder="Nome ou CPF do paciente" aria-label="Buscar paciente" autoFocus />
            <button className="btn-secondary">Buscar</button>
          </form>
          {term.length >= 2 && results.length === 0 && <p className="text-sm text-slate-500">Nenhum paciente encontrado. Cadastre na aba Pacientes.</p>}
          <ul className="divide-y divide-slate-100 text-sm">
            {results.map((p) => (
              <li key={p.id} className="py-2">
                <Link href={`/exames?paciente=${p.id}`} className="font-medium text-marinho-700 hover:underline">{p.name}</Link>
                {p.birthDate && <span className="text-slate-500"> · nascimento {formatDate(p.birthDate)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="card space-y-2">
        <h2 className="font-semibold text-marinho-800">Agendados nos próximos dias ({upcoming.length})</h2>
        {upcoming.length === 0 && <p className="text-sm text-slate-500">Nenhum exame agendado.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {upcoming.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <strong>{formatDateTime(e.scheduledAt)}</strong> · {e.patient.socialName || e.patient.name} · {e.examType.name} <ExamBadge status={e.status} />
              </span>
              <details className="text-xs">
                <summary className="cursor-pointer text-marinho-700">Desmarcar</summary>
                <ActionForm action={cancelExam.bind(null, e.id)} submitLabel="Desmarcar" className="mt-1 flex flex-wrap items-end gap-2">
                  <input name="reason" className="input w-auto! min-w-48" placeholder="Motivo" aria-label="Motivo" />
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
