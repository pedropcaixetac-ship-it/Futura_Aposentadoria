import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatTime } from "@/lib/agenda";
import { compareBedCodes } from "@/lib/internacao";
import { ActionForm } from "../financeiro/action-form";
import { registerVisit, registerVisitExit } from "./actions";

// Início do dia de hoje no horário de Brasília.
function startOfToday() {
  const br = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3));
}

export default async function VisitsPage() {
  const user = await requireUser("visitas");
  const [admissions, visits] = await Promise.all([
    prisma.admission.findMany({
      where: { clinicId: user.clinicId, dischargedAt: null },
      include: { patient: { select: { name: true, socialName: true } }, bed: { include: { ward: { select: { name: true } } } } },
    }),
    prisma.visit.findMany({
      where: { clinicId: user.clinicId, OR: [{ leftAt: null }, { enteredAt: { gte: startOfToday() } }] },
      include: { admission: { include: { patient: { select: { name: true, socialName: true } }, bed: { select: { code: true } } } } },
      orderBy: { enteredAt: "desc" },
    }),
  ]);
  admissions.sort((a, b) => a.bed.ward.name.localeCompare(b.bed.ward.name) || compareBedCodes(a.bed.code, b.bed.code));
  const inside = visits.filter((v) => !v.leftAt);
  const gone = visits.filter((v) => v.leftAt);
  const patientName = (p: { name: string; socialName: string | null }) => p.socialName || p.name;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Visitas</h1>
        <p className="text-sm text-slate-500">Registre a entrada e a saída de quem vem visitar os pacientes internados.</p>
      </div>

      {admissions.length === 0 ? (
        <p className="card text-sm text-slate-600">Nenhum paciente internado agora.</p>
      ) : (
        <ActionForm action={registerVisit} submitLabel="Registrar entrada">
          <h2 className="font-semibold text-marinho-800">Nova visita</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="admissionId">Paciente visitado</label>
              <select className="input" id="admissionId" name="admissionId" defaultValue="" required>
                <option value="" disabled>Escolha o paciente</option>
                {admissions.map((a) => (
                  <option key={a.id} value={a.id}>{a.bed.ward.name} · {a.bed.code} · {patientName(a.patient)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="visitorName">Nome do visitante</label>
              <input className="input" id="visitorName" name="visitorName" required />
            </div>
            <div>
              <label className="label" htmlFor="visitorDocument">Documento (RG ou CPF)</label>
              <input className="input" id="visitorDocument" name="visitorDocument" />
            </div>
            <div>
              <label className="label" htmlFor="relationship">Parentesco</label>
              <input className="input" id="relationship" name="relationship" placeholder="Ex.: filha, esposo, amigo" />
            </div>
          </div>
        </ActionForm>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">No hospital agora ({inside.length})</h2>
        {inside.length === 0 && <p className="text-sm text-slate-500">Nenhum visitante dentro do hospital.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {inside.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <strong>{v.visitorName}</strong>
                <span className="text-slate-500">
                  {v.relationship && ` (${v.relationship})`} · visita {patientName(v.admission.patient)}, leito {v.admission.bed.code} · entrou às {formatTime(v.enteredAt)}
                </span>
              </span>
              <form action={registerVisitExit.bind(null, v.id)}>
                <button className="btn-secondary">Registrar saída</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {gone.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-semibold text-marinho-800">Já saíram hoje ({gone.length})</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {gone.map((v) => (
              <li key={v.id} className="py-2">
                <strong>{v.visitorName}</strong>
                <span className="text-slate-500">
                  {v.relationship && ` (${v.relationship})`} · {patientName(v.admission.patient)}, leito {v.admission.bed.code} · {formatTime(v.enteredAt)} às {formatTime(v.leftAt!)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
