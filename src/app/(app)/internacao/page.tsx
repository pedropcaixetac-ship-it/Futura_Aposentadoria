import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasTab } from "@/lib/tabs";
import { canViewClinical, canWorkClinical } from "@/lib/permissions";
import { age } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { bedState, bedStateLabel, compareBedCodes, daysAdmitted, daysLabel, occupancy, type BedState } from "@/lib/internacao";
import { isolationLabel, isolationStyle } from "@/lib/ccih";
import { canAdmit } from "@/lib/hospital-roles";
import { markBedClean } from "./actions";

const tileStyle: Record<BedState, string> = {
  OCUPADO: "border-marinho-300 bg-marinho-50",
  LIVRE: "border-emerald-300 bg-emerald-50",
  LIMPEZA: "border-amber-300 bg-amber-50",
  BLOQUEADO: "border-slate-300 bg-slate-100 text-slate-500",
};

const badgeStyle: Record<BedState, string> = {
  OCUPADO: "bg-marinho-700 text-white",
  LIVRE: "bg-emerald-600 text-white",
  LIMPEZA: "bg-amber-500 text-white",
  BLOQUEADO: "bg-slate-400 text-white",
};

export default async function BedMapPage() {
  const user = await requireUser("internacao");
  const clinical = canViewClinical(user);

  const [wards, admissions] = await Promise.all([
    prisma.ward.findMany({
      where: { clinicId: user.clinicId, active: true },
      include: { beds: { where: { active: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.admission.findMany({
      where: { clinicId: user.clinicId, dischargedAt: null },
      include: {
        patient: { select: { id: true, name: true, socialName: true, birthDate: true, sex: true } },
        attending: { select: { name: true, sex: true, jobTitle: true } },
        isolations: { where: { endedAt: null }, select: { kind: true } },
      },
    }),
  ]);
  const byBed = new Map(admissions.map((a) => [a.bedId, a]));
  const allStates = wards.flatMap((w) => w.beds.map((b) => bedState(b, byBed.has(b.id))));
  const total = occupancy(allStates);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Internação</h1>
          <p className="text-sm text-slate-500">Mapa de leitos. Clique num leito ocupado para abrir a internação.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWorkClinical(user) && wards.length > 0 && <Link href="/internacao/plantao" className="btn-secondary">Passagem de plantão</Link>}
          {hasTab(user, "leitos") && <Link href="/internacao/leitos" className="btn-secondary">Alas e leitos</Link>}
          {total.livres > 0 && canAdmit(user) && <Link href="/internacao/internar" className="btn-primary">Internar paciente</Link>}
        </div>
      </div>

      {wards.length === 0 ? (
        <div className="card text-sm text-slate-600">
          Nenhuma ala cadastrada ainda.{" "}
          {hasTab(user, "leitos") ? (
            <Link href="/internacao/leitos" className="text-marinho-700 hover:underline">Cadastre as alas e os leitos</Link>
          ) : (
            "Peça ao gerente do sistema para cadastrar as alas e os leitos."
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="card"><p className="text-sm text-slate-500">Ocupação</p><p className="text-2xl font-semibold text-marinho-800">{total.percentual}%</p></div>
            <div className="card"><p className="text-sm text-slate-500">Ocupados</p><p className="text-2xl font-semibold text-marinho-800">{total.ocupados}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Livres</p><p className="text-2xl font-semibold text-emerald-700">{total.livres}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Em limpeza</p><p className="text-2xl font-semibold text-amber-600">{total.limpeza}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Bloqueados</p><p className="text-2xl font-semibold text-slate-500">{total.bloqueados}</p></div>
          </div>

          {wards.map((ward) => {
            const beds = [...ward.beds].sort((a, b) => compareBedCodes(a.code, b.code));
            const stats = occupancy(beds.map((b) => bedState(b, byBed.has(b.id))));
            return (
              <section key={ward.id} className="space-y-3">
                <h2 className="flex flex-wrap items-baseline gap-2 font-semibold text-marinho-800">
                  {ward.name}
                  <span className="text-sm font-normal text-slate-500">
                    {ward.kind} · {stats.ocupados} de {stats.total - stats.bloqueados} ocupados
                  </span>
                </h2>
                {beds.length === 0 && <p className="text-sm text-slate-500">Nenhum leito nesta ala.</p>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {beds.map((bed) => {
                    const admission = byBed.get(bed.id);
                    const state = bedState(bed, !!admission);
                    const header = (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-lg font-semibold">{bed.code}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${badgeStyle[state]}`}>{bedStateLabel[state]}</span>
                      </div>
                    );
                    if (admission) {
                      const years = age(admission.patient.birthDate);
                      return (
                        <Link key={bed.id} href={`/internacao/${admission.id}`} className={`block space-y-1 rounded-lg border p-3 transition hover:shadow-md ${tileStyle[state]}`}>
                          {header}
                          <p className="font-medium text-marinho-900">{admission.patient.socialName || admission.patient.name}</p>
                          <p className="text-xs text-slate-600">
                            {[years !== null && `${years} anos`, daysLabel(daysAdmitted(admission.admittedAt))].filter(Boolean).join(" · ")}
                          </p>
                          <p className="text-xs text-slate-600">{displayName(admission.attending)}</p>
                          {admission.isolations.map((i) => (
                            <p key={i.kind} className={`inline-block rounded px-1.5 text-xs ${isolationStyle[i.kind]}`}>Isolamento: {isolationLabel[i.kind]}</p>
                          ))}
                          {clinical && admission.cidCode && <p className="text-xs text-slate-500">CID {admission.cidCode}</p>}
                        </Link>
                      );
                    }
                    return (
                      <div key={bed.id} className={`space-y-2 rounded-lg border p-3 ${tileStyle[state]}`}>
                        {header}
                        {state === "LIVRE" && canAdmit(user) && (
                          <Link href={`/internacao/internar?leito=${bed.id}`} className="text-sm text-emerald-800 hover:underline">Internar neste leito</Link>
                        )}
                        {state === "LIMPEZA" && (
                          <form action={markBedClean.bind(null, bed.id)}>
                            <button className="text-sm text-amber-800 hover:underline">Leito limpo, liberar</button>
                          </form>
                        )}
                        {state === "BLOQUEADO" && bed.statusNote && <p className="text-xs">{bed.statusNote}</p>}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
