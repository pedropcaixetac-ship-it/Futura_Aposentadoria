import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { loadResultLabel, methodLabel, packageState, packageStateLabel, type PackageState } from "@/lib/cme";
import { ActionForm } from "../financeiro/action-form";
import { discardPackage, judgeLoad, saveKit, startLoad } from "./actions";

const resultTone = { PENDENTE: "bg-amber-100 text-amber-900", LIBERADA: "bg-emerald-100 text-emerald-800", REPROVADA: "bg-red-100 text-red-800", RECOLHIDA: "bg-red-100 text-red-800" };

// CME: cargas aguardando indicadores, estoque de pacotes estéreis por kit e nova carga.
export default async function CmePage() {
  const user = await requireUser("cme");
  const now = new Date();
  const [kits, loads, packages] = await Promise.all([
    prisma.cmeKit.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } }),
    prisma.sterilizationLoad.findMany({
      where: { clinicId: user.clinicId },
      include: { operator: { select: { name: true, sex: true, jobTitle: true } }, _count: { select: { packages: true } } },
      orderBy: { startedAt: "desc" },
      take: 30,
    }),
    prisma.sterilePackage.findMany({
      where: { clinicId: user.clinicId, usedAt: null, discardedAt: null },
      include: { load: { select: { code: true, result: true } } },
      orderBy: { expiresAt: "asc" },
    }),
  ]);
  const pending = loads.filter((l) => l.result === "PENDENTE");
  const states = packages.map((p) => ({ p, state: packageState(p, p.load, now) }));
  const count = (kitId: string, ...wanted: PackageState[]) => states.filter((s) => s.p.kitId === kitId && wanted.includes(s.state)).length;
  const expired = states.filter((s) => s.state === "VENCIDO" || s.state === "BLOQUEADO");
  const kitName = new Map(kits.map((k) => [k.id, k.name]));

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">CME</h1>
        <p className="text-sm text-slate-500">Central de material e esterilização. Pacote só vai para a sala com a carga liberada pelos indicadores e dentro da validade.</p>
      </div>

      {pending.length > 0 && (
        <section className="card space-y-3 border-amber-300">
          <h2 className="font-semibold text-amber-800">Cargas aguardando indicadores ({pending.length})</h2>
          {pending.map((l) => (
            <ActionForm key={l.id} action={judgeLoad.bind(null, l.id)} submitLabel="Registrar resultado" className="space-y-2 rounded-md border border-slate-200 p-3 text-sm">
              <p><Link href={`/cme/carga/${l.id}`} className="font-semibold text-marinho-700 hover:underline">{l.code}</Link> · {methodLabel[l.method]} · {l.equipment} · {l._count.packages} pacote(s) · {formatDateTime(l.startedAt)}</p>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2"><input type="checkbox" name="chemicalOk" /> Indicador químico aprovado</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="biologicalOk" /> Indicador biológico negativo</label>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2"><input type="radio" name="decision" value="LIBERADA" defaultChecked /> Liberar</label>
                <label className="flex items-center gap-2"><input type="radio" name="decision" value="REPROVADA" /> Reprovar</label>
                <input name="note" className="input w-auto! min-w-64" placeholder="Motivo (se reprovar)" aria-label="Motivo" />
              </div>
            </ActionForm>
          ))}
        </section>
      )}

      <section className="card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Kit</th><th className="px-3 py-2">Disponíveis</th><th className="px-3 py-2">Vencem em 3 dias</th><th className="px-3 py-2">Aguardando carga</th><th className="px-3 py-2">Validade</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {kits.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nenhum kit cadastrado.</td></tr>}
            {kits.map((k) => {
              const ready = count(k.id, "DISPONIVEL", "VENCE_EM_BREVE");
              return (
                <tr key={k.id}>
                  <td className="px-3 py-2 font-medium">{k.name}</td>
                  <td className={`px-3 py-2 font-semibold ${ready === 0 ? "text-red-700" : "text-emerald-700"}`}>{ready}</td>
                  <td className="px-3 py-2">{count(k.id, "VENCE_EM_BREVE") || "—"}</td>
                  <td className="px-3 py-2">{count(k.id, "AGUARDANDO") || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{k.validityDays} dias</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {expired.length > 0 && (
        <section className="card space-y-2 border-red-200">
          <h2 className="font-semibold text-red-800">Retirar para reprocessar ({expired.length})</h2>
          <ul className="space-y-2 text-sm">
            {expired.map(({ p, state }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span>{kitName.get(p.kitId)} · carga {p.load.code} · {packageStateLabel[state]} (validade {formatDate(p.expiresAt)})</span>
                <ActionForm action={discardPackage.bind(null, p.id)} submitLabel="Retirado" className="inline-flex">
                  <input type="hidden" name="reason" value={state === "VENCIDO" ? "Vencido" : "Carga reprovada ou recolhida"} />
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {kits.length > 0 && (
          <ActionForm action={startLoad} submitLabel="Registrar carga">
            <h2 className="font-semibold text-marinho-800">Nova carga</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="method">Método</label>
                <select className="input" id="method" name="method" defaultValue="VAPOR">
                  {Object.entries(methodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="equipment">Equipamento</label>
                <input className="input" id="equipment" name="equipment" defaultValue="Autoclave 1" required />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Pacotes na carga</p>
              {kits.map((k) => (
                <label key={k.id} className="flex items-center justify-between gap-2 text-sm">
                  {k.name}
                  <input name={`qty_${k.id}`} type="number" min={0} max={200} defaultValue={0} className="input w-24!" aria-label={`Quantidade de ${k.name}`} />
                </label>
              ))}
            </div>
          </ActionForm>
        )}
        <ActionForm action={saveKit} submitLabel="Cadastrar kit">
          <h2 className="font-semibold text-marinho-800">Novo kit</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="kit-name">Nome</label>
              <input className="input" id="kit-name" name="name" required placeholder="Ex.: Caixa de laparotomia" />
            </div>
            <div>
              <label className="label" htmlFor="validityDays">Validade (dias)</label>
              <input className="input" id="validityDays" name="validityDays" type="number" min={1} max={365} defaultValue={30} />
            </div>
          </div>
        </ActionForm>
      </div>

      <section className="card space-y-2">
        <h2 className="font-semibold text-marinho-800">Cargas recentes</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {loads.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><Link href={`/cme/carga/${l.id}`} className="font-medium text-marinho-700 hover:underline">{l.code}</Link> · {methodLabel[l.method]} · {l._count.packages} pacote(s) · {displayName(l.operator)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${resultTone[l.result]}`}>{loadResultLabel[l.result]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
