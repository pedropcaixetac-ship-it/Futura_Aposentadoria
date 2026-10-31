import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { patientNameWhere } from "@/lib/patient";
import { isPhysician } from "@/lib/pronto-socorro";
import { displayName } from "@/lib/staff";
import { formatDate } from "@/lib/format";
import { anesthesiaLabel, LATERALITIES } from "@/lib/centro-cirurgico";
import { ActionForm } from "../../financeiro/action-form";
import { scheduleSurgery } from "../actions";

export default async function ScheduleSurgeryPage({ searchParams }: { searchParams: Promise<{ q?: string; paciente?: string }> }) {
  const user = await requireUser("centro-cirurgico");
  const { q = "", paciente } = await searchParams;
  const term = q.trim();
  const digits = term.replace(/\D/g, "");
  const [patient, results, rooms, staff] = await Promise.all([
    paciente ? prisma.patient.findFirst({ where: { id: paciente, clinicId: user.clinicId }, select: { id: true, name: true, socialName: true, birthDate: true, allergies: true } }) : null,
    term.length >= 2
      ? prisma.patient.findMany({
          where: { clinicId: user.clinicId, OR: [patientNameWhere(term), ...(digits.length >= 3 ? [{ cpf: { contains: digits } }] : [])] },
          select: { id: true, name: true, birthDate: true },
          orderBy: { name: "asc" },
          take: 10,
        })
      : [],
    prisma.operatingRoom.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { clinicId: user.clinicId, active: true, councilType: "CRM" }, select: { id: true, name: true, sex: true, jobTitle: true, role: true, councilNumber: true, councilType: true }, orderBy: { name: "asc" } }),
  ]);
  const doctors = staff.filter(isPhysician);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/centro-cirurgico" className="text-sm text-marinho-700 hover:underline">← Mapa cirúrgico</Link>
        <h1 className="mt-1 text-2xl font-semibold">Agendar cirurgia</h1>
        <p className="text-sm text-slate-500">O sistema não deixa marcar a mesma sala nem o mesmo cirurgião em horários que se cruzam.</p>
      </div>
      {patient ? (
        <ActionForm action={scheduleSurgery.bind(null, patient.id)} submitLabel="Agendar" resetOnSuccess={false}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{patient.socialName || patient.name}</p>
              {patient.birthDate && <p className="text-xs text-slate-500">nascimento {formatDate(patient.birthDate)}</p>}
              {patient.allergies && <p className="mt-1 inline-block rounded bg-red-50 px-2 text-sm font-medium text-red-700">Alergias: {patient.allergies}</p>}
            </div>
            <Link href="/centro-cirurgico/agendar" className="text-sm text-marinho-700 hover:underline">Trocar paciente</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="procedure">Cirurgia</label>
              <input className="input" id="procedure" name="procedure" required placeholder="Ex.: Colecistectomia videolaparoscópica" />
            </div>
            <div>
              <label className="label" htmlFor="laterality">Lado</label>
              <select className="input" id="laterality" name="laterality" defaultValue="">
                <option value="">Não se aplica</option>
                {LATERALITIES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="anesthesia">Anestesia</label>
              <select className="input" id="anesthesia" name="anesthesia" defaultValue="GERAL">
                {Object.entries(anesthesiaLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="roomId">Sala</label>
              <select className="input" id="roomId" name="roomId" defaultValue="" required>
                <option value="" disabled>Escolha</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="scheduledAt">Dia e hora</label>
              <input className="input" id="scheduledAt" name="scheduledAt" type="datetime-local" required />
            </div>
            <div>
              <label className="label" htmlFor="expectedMinutes">Duração prevista (min)</label>
              <input className="input" id="expectedMinutes" name="expectedMinutes" type="number" min={10} max={1440} step={10} defaultValue={90} required />
            </div>
            <div>
              <label className="label" htmlFor="surgeonId">Cirurgião</label>
              <select className="input" id="surgeonId" name="surgeonId" defaultValue={isPhysician(user) ? user.id : ""} required>
                <option value="" disabled>Escolha</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{displayName(d)}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="anesthetistId">Anestesista</label>
              <select className="input" id="anesthetistId" name="anesthetistId" defaultValue="">
                <option value="">A definir</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{displayName(d)}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="note">Observação</label>
              <input className="input" id="note" name="note" placeholder="Ex.: reservar 2 concentrados de hemácias; precisa de arco em C" />
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
                <Link href={`/centro-cirurgico/agendar?paciente=${p.id}`} className="font-medium text-marinho-700 hover:underline">{p.name}</Link>
                {p.birthDate && <span className="text-slate-500"> · nascimento {formatDate(p.birthDate)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
