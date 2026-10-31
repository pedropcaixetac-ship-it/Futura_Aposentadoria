import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canViewClinical, canWorkClinical } from "@/lib/permissions";
import { age, formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { vitalsSummary, type Vitals } from "@/lib/vitals";
import { compareBedCodes, currentShift, daysAdmitted, daysLabel, fluidBalance, fluidDayStart, formatBalance, shiftLabel } from "@/lib/internacao";
import { PrintButton } from "../../pacientes/[id]/atendimentos/[encounterId]/print-button";

// Texto corrido de uma evolução (os campos do modelo, na ordem), cortado para caber na passagem de plantão.
function excerpt(content: unknown, max = 280) {
  const text = Object.values((content ?? {}) as Record<string, unknown>)
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join(" · ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default async function ShiftHandoverPage({ searchParams }: { searchParams: Promise<{ ala?: string }> }) {
  const user = await requireUser("internacao");
  if (!canWorkClinical(user)) notFound();
  // Evoluções de outros profissionais só para quem tem acesso completo ao prontuário.
  const full = canViewClinical(user);
  const { ala } = await searchParams;
  const wards = await prisma.ward.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const wardId = wards.find((w) => w.id === ala)?.id ?? wards[0]?.id;

  const admissions = wardId
    ? await prisma.admission.findMany({
        where: { clinicId: user.clinicId, dischargedAt: null, bed: { wardId } },
        include: {
          patient: { select: { name: true, socialName: true, birthDate: true, allergies: true } },
          bed: { select: { code: true } },
          attending: { select: { name: true, sex: true, jobTitle: true } },
          vitalRecords: { where: { canceledAt: null }, orderBy: { takenAt: "desc" }, take: 1 },
          fluidEntries: { where: { canceledAt: null, at: { gte: fluidDayStart() } } },
          evolutions: {
            where: { status: "FINALIZADO" },
            orderBy: { startedAt: "desc" },
            take: 6,
            include: { professional: { select: { name: true, sex: true, jobTitle: true } } },
          },
        },
      })
    : [];
  admissions.sort((a, b) => compareBedCodes(a.bed.code, b.bed.code));
  const ward = wards.find((w) => w.id === wardId);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="no-print">
        <Link href="/internacao" className="text-sm text-marinho-700 hover:underline">← Mapa de leitos</Link>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Passagem de plantão{ward && ` · ${ward.name}`}</h1>
          <p className="text-sm text-slate-500">
            {formatDateTime(new Date())} · plantão da {shiftLabel[currentShift()].toLowerCase()} · {admissions.length} paciente(s) internado(s)
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          {wards.length > 1 && (
            <form className="flex gap-2">
              <select className="input w-auto!" name="ala" defaultValue={wardId} aria-label="Ala">
                {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <button className="btn-secondary">Ver</button>
            </form>
          )}
          <PrintButton />
        </div>
      </div>

      {admissions.length === 0 && <p className="card text-sm text-slate-500">Nenhum paciente internado nesta ala.</p>}
      {admissions.map((a) => {
        const vitals = a.vitalRecords[0];
        const balance = fluidBalance(a.fluidEntries);
        const years = age(a.patient.birthDate);
        const lastOf = (kind: string) => a.evolutions.find((e) => e.evolutionKind === kind);
        return (
          <article key={a.id} className="card space-y-2 text-sm break-inside-avoid">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-marinho-800">
                {a.bed.code} · <Link href={`/internacao/${a.id}`} className="hover:underline">{a.patient.socialName || a.patient.name}</Link>
              </h2>
              <span className="text-slate-500">
                {[years !== null && `${years} anos`, daysLabel(daysAdmitted(a.admittedAt)), displayName(a.attending)].filter(Boolean).join(" · ")}
              </span>
            </div>
            {a.patient.allergies && <p className="font-medium text-red-700">Alergias: {a.patient.allergies}</p>}
            {(a.cidCode || a.reason) && (
              <p><span className="text-slate-500">Motivo:</span> {[a.cidCode && `${a.cidCode} ${a.cidDescription ?? ""}`, a.reason].filter(Boolean).join(" · ")}</p>
            )}
            <p>
              <span className="text-slate-500">Últimos sinais:</span>{" "}
              {vitals ? `${[vitalsSummary(vitals.vitals as Vitals), vitals.pain !== null ? `Dor ${vitals.pain}` : ""].filter(Boolean).join(" · ")} (${formatDateTime(vitals.takenAt)})` : "nenhum registrado"}
            </p>
            <p>
              <span className="text-slate-500">Balanço desde as 7h:</span>{" "}
              {a.fluidEntries.length ? `entrou ${balance.entrada.toLocaleString("pt-BR")} mL, saiu ${balance.saida.toLocaleString("pt-BR")} mL, ${formatBalance(balance.balanco)}` : "sem lançamentos"}
            </p>
            {full &&
              (["MEDICA", "ENFERMAGEM", "MULTIPROFISSIONAL"] as const).map((kind) => {
                const e = lastOf(kind);
                if (!e) return null;
                return (
                  <p key={kind}>
                    <span className="text-slate-500">
                      {kind === "MEDICA" ? "Última evolução médica" : kind === "ENFERMAGEM" ? "Última evolução de enfermagem" : "Última evolução multiprofissional"} ({formatDateTime(e.startedAt)}, {displayName(e.professional)}):
                    </span>{" "}
                    {excerpt(e.content)}
                  </p>
                );
              })}
          </article>
        );
      })}
    </div>
  );
}
