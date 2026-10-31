import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { patientNameWhere } from "@/lib/patient";
import { isPhysician } from "@/lib/pronto-socorro";
import { kitchenDate as todayDate } from "@/lib/cozinha";
import { age, formatDate } from "@/lib/format";
import { ActionForm } from "../../financeiro/action-form";
import { startPlan } from "../actions";
import { ChemoNav } from "../nav";

// Novo tratamento: acha o paciente e escolhe protocolo, ciclos, altura e peso.
export default async function NewPlanPage({ searchParams }: { searchParams: Promise<{ q?: string; paciente?: string }> }) {
  const user = await requireUser("quimioterapia");
  const { q = "", paciente } = await searchParams;
  const term = q.trim();
  const digits = term.replace(/\D/g, "");
  const [patient, results, protocols] = await Promise.all([
    paciente ? prisma.patient.findFirst({ where: { id: paciente, clinicId: user.clinicId }, select: { id: true, name: true, socialName: true, birthDate: true, allergies: true } }) : null,
    term.length >= 2
      ? prisma.patient.findMany({
          where: { clinicId: user.clinicId, OR: [patientNameWhere(term), ...(digits.length >= 3 ? [{ cpf: { contains: digits } }] : [])] },
          select: { id: true, name: true, birthDate: true },
          orderBy: { name: "asc" },
          take: 10,
        })
      : [],
    prisma.chemoProtocol.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Quimioterapia</h1>
        <p className="text-sm text-slate-500">Ao iniciar, o sistema calcula a superfície corporal, as doses e agenda todas as sessões dos ciclos.</p>
      </div>
      <ChemoNav current="novo" />
      {!isPhysician(user) ? (
        <p className="card text-sm text-slate-500">Só médico (CRM) inicia tratamento.</p>
      ) : patient ? (
        <ActionForm action={startPlan.bind(null, patient.id)} submitLabel="Iniciar tratamento" resetOnSuccess={false}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{patient.socialName || patient.name}</p>
              <p className="text-xs text-slate-500">{[age(patient.birthDate) !== null && `${age(patient.birthDate)} anos`, patient.birthDate && `nascimento ${formatDate(patient.birthDate)}`].filter(Boolean).join(" · ")}</p>
              {patient.allergies && <p className="mt-1 inline-block rounded bg-red-50 px-2 text-sm font-medium text-red-700">Alergias: {patient.allergies}</p>}
            </div>
            <Link href="/quimioterapia/novo" className="text-sm text-marinho-700 hover:underline">Trocar paciente</Link>
          </div>
          {protocols.length === 0 ? (
            <p className="text-sm text-amber-700">Cadastre um protocolo primeiro, na aba Protocolos.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="protocolId">Protocolo</label>
                <select className="input" id="protocolId" name="protocolId" defaultValue="" required>
                  <option value="" disabled>Escolha</option>
                  {protocols.map((p) => <option key={p.id} value={p.id}>{p.name} (a cada {p.cycleDays} dias)</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="cycles">Ciclos</label>
                <input className="input" id="cycles" name="cycles" type="number" min={1} max={60} defaultValue={4} required />
              </div>
              <div>
                <label className="label" htmlFor="startDate">Primeiro dia (D1)</label>
                <input className="input" id="startDate" name="startDate" type="date" defaultValue={todayDate().toISOString().slice(0, 10)} required />
              </div>
              <div>
                <label className="label" htmlFor="heightCm">Altura (cm)</label>
                <input className="input" id="heightCm" name="heightCm" type="number" min={30} max={250} required />
              </div>
              <div>
                <label className="label" htmlFor="weightKg">Peso (kg)</label>
                <input className="input" id="weightKg" name="weightKg" inputMode="decimal" required />
              </div>
              <div>
                <label className="label" htmlFor="doseLevel">Dose (%)</label>
                <input className="input" id="doseLevel" name="doseLevel" type="number" min={10} max={150} defaultValue={100} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="note">Observação</label>
                <input className="input" id="note" name="note" placeholder="Ex.: CID C50.9, intenção adjuvante" />
              </div>
            </div>
          )}
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
                <Link href={`/quimioterapia/novo?paciente=${p.id}`} className="font-medium text-marinho-700 hover:underline">{p.name}</Link>
                {p.birthDate && <span className="text-slate-500"> · nascimento {formatDate(p.birthDate)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
