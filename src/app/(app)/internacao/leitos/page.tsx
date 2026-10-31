import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { bedState, bedStateLabel, compareBedCodes, WARD_KINDS } from "@/lib/internacao";
import { ActionForm } from "../../financeiro/action-form";
import { addBeds, blockBed, removeBed, saveWard, unblockBed } from "../actions";

export default async function BedsPage() {
  const user = await requireUser("leitos");
  const [wards, occupied] = await Promise.all([
    prisma.ward.findMany({
      where: { clinicId: user.clinicId, active: true },
      include: { beds: { where: { active: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.admission.findMany({ where: { clinicId: user.clinicId, dischargedAt: null }, select: { bedId: true } }),
  ]);
  const occupiedBeds = new Set(occupied.map((a) => a.bedId));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/internacao" className="text-sm text-marinho-700 hover:underline">← Mapa de leitos</Link>
        <h1 className="mt-1 text-2xl font-semibold">Alas e leitos</h1>
        <p className="text-sm text-slate-500">Cadastre cada ala do hospital e os leitos dela. Leito bloqueado não aparece para internar.</p>
      </div>

      <ActionForm action={saveWard} submitLabel="Cadastrar ala">
        <h2 className="font-semibold text-marinho-800">Nova ala</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Nome</label>
            <input className="input" id="name" name="name" required placeholder="Ex.: Enfermaria clínica, 2º andar" />
          </div>
          <div>
            <label className="label" htmlFor="kind">Tipo</label>
            <select className="input" id="kind" name="kind" defaultValue="Enfermaria">
              {WARD_KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
        </div>
      </ActionForm>

      {wards.map((ward) => (
        <section key={ward.id} className="card space-y-4">
          <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">
            {ward.name} <span className="text-sm font-normal text-slate-500">· {ward.kind} · {ward.beds.length} leito(s)</span>
          </h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {[...ward.beds].sort((a, b) => compareBedCodes(a.code, b.code)).map((bed) => {
              const state = bedState(bed, occupiedBeds.has(bed.id));
              return (
                <li key={bed.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong>{bed.code}</strong> <span className="text-slate-500">· {bedStateLabel[state]}{bed.statusNote && state === "BLOQUEADO" && ` (${bed.statusNote})`}</span>
                  </span>
                  {state !== "OCUPADO" && (
                    <span className="flex flex-wrap items-center gap-2">
                      {state === "BLOQUEADO" ? (
                        <form action={unblockBed.bind(null, bed.id)}>
                          <button className="text-marinho-700 hover:underline">Desbloquear</button>
                        </form>
                      ) : (
                        <form action={blockBed.bind(null, bed.id)} className="flex items-center gap-2">
                          <input className="input h-8! w-48! py-1! text-xs" name="reason" placeholder="Motivo do bloqueio" aria-label={`Motivo do bloqueio do leito ${bed.code}`} />
                          <button className="text-marinho-700 hover:underline">Bloquear</button>
                        </form>
                      )}
                      <form action={removeBed.bind(null, bed.id)}>
                        <button className="text-red-700 hover:underline">Remover</button>
                      </form>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <ActionForm action={addBeds.bind(null, ward.id)} submitLabel="Incluir leitos" className="space-y-3 rounded-md bg-marinho-50 p-3">
            <label className="label" htmlFor={`codes-${ward.id}`}>Incluir leitos</label>
            <input className="input" id={`codes-${ward.id}`} name="codes" required placeholder="Ex.: 101 a 110, ou 201-A, 201-B" />
          </ActionForm>
        </section>
      ))}
    </div>
  );
}
