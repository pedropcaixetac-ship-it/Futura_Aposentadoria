import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { frequencyLabel } from "@/lib/prescricao";
import { ActionForm } from "../financeiro/action-form";
import { dispense } from "./actions";
import { loadStock } from "./data";
import { PharmacyNav } from "./nav";
import { Pager, pageNumber } from "../pager";

// Farmácia: alertas do estoque e a fila do que foi prescrito para os pacientes que estão no hospital.
// Num hospital cheio são milhares de itens: a fila vem por ala e em páginas (cada linha tem a lista de produtos).
const PAGE_SIZE = 30;

export default async function PharmacyPage({ searchParams }: { searchParams: Promise<{ ala?: string; pagina?: string; dispensados?: string }> }) {
  const user = await requireUser("farmacia");
  const { ala = "", pagina, dispensados } = await searchParams;
  const page = pageNumber(pagina);
  const showServed = dispensados === "1";
  const place: Prisma.PrescriptionItemWhereInput =
    ala === "ps" ? { emergencyVisit: { closedAt: null } } : ala ? { admission: { dischargedAt: null, bed: { wardId: ala } } } : { OR: [{ admission: { dischargedAt: null } }, { emergencyVisit: { closedAt: null } }] };
  const base: Prisma.PrescriptionItemWhereInput = {
    clinicId: user.clinicId,
    kind: "MEDICAMENTO",
    suspendedAt: null,
    OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
    AND: [place],
  };
  const listWhere: Prisma.PrescriptionItemWhereInput = { ...base, dispensations: showServed ? { some: {} } : { none: {} } };
  const [stock, items, pendingCount, servedCount, wards] = await Promise.all([
    loadStock(user.clinicId),
    prisma.prescriptionItem.findMany({
      where: { ...listWhere, clinicId: user.clinicId },
      include: {
        patient: { select: { name: true, socialName: true } },
        prescriber: { select: { name: true, sex: true, jobTitle: true } },
        admission: { select: { bed: { select: { code: true, ward: { select: { name: true } } } } } },
        emergencyVisit: { select: { id: true } },
        dispensations: { select: { quantity: true, at: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.prescriptionItem.count({ where: { ...base, clinicId: user.clinicId, dispensations: { none: {} } } }),
    prisma.prescriptionItem.count({ where: { ...base, clinicId: user.clinicId, dispensations: { some: {} } } }),
    prisma.ward.findMany({ where: { clinicId: user.clinicId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const alerts = stock.filter((s) => s.low || s.expired > 0 || s.expiringSoon.length > 0);
  const where = (i: (typeof items)[number]) => (i.admission ? `${i.admission.bed.ward.name} · leito ${i.admission.bed.code}` : "Pronto-socorro");
  const href = (p: { ala?: string; pagina?: number; dispensados?: boolean }) => {
    const q = new URLSearchParams({ ...(p.ala && { ala: p.ala }), ...(p.dispensados && { dispensados: "1" }), ...(p.pagina && p.pagina > 1 && { pagina: String(p.pagina) }) });
    return `/farmacia${q.size ? `?${q}` : ""}`;
  };
  // Só produtos com saldo na lista de cada linha (com centenas de produtos, a lista inteira em cada linha pesa demais).
  const usableStock = stock.filter((s) => s.usable > 0);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Farmácia</h1>
        <p className="text-sm text-slate-500">O que os médicos prescreveram para quem está internado ou no pronto-socorro. A saída é sempre do lote que vence primeiro.</p>
      </div>
      <PharmacyNav current="dispensacao" />

      {alerts.length > 0 && (
        <section className="card space-y-2 border-amber-300">
          <h2 className="font-semibold text-amber-800">Alertas do estoque</h2>
          <ul className="space-y-1 text-sm">
            {alerts.map((a) => (
              <li key={a.product.id}>
                <Link href={`/farmacia/estoque/${a.product.id}`} className="font-medium text-marinho-700 hover:underline">{a.product.name}{a.product.presentation && ` ${a.product.presentation}`}</Link>
                {a.low && <span className="ml-2 text-red-700">abaixo do mínimo ({a.usable} de {a.product.minStock})</span>}
                {a.expired > 0 && <span className="ml-2 text-red-700">{a.expired} vencido(s) para dar baixa</span>}
                {a.expiringSoon.length > 0 && <span className="ml-2 text-amber-700">lote {a.expiringSoon.map((l) => l.lot).join(", ")} vence em até 30 dias</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="flex flex-wrap items-end gap-2" action="/farmacia">
        <div>
          <label className="label" htmlFor="ala">Ala</label>
          <select id="ala" name="ala" defaultValue={ala} className="input w-auto! min-w-56">
            <option value="">Todo o hospital</option>
            <option value="ps">Pronto-socorro</option>
            {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        {showServed && <input type="hidden" name="dispensados" value="1" />}
        <button className="btn-secondary">Filtrar</button>
      </form>

      <div className="flex gap-2 text-sm">
        <Link href={href({ ala })} className={showServed ? "btn-secondary" : "btn-primary"}>A dispensar ({pendingCount})</Link>
        <Link href={href({ ala, dispensados: true })} className={showServed ? "btn-primary" : "btn-secondary"}>Já dispensados ({servedCount})</Link>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold text-marinho-800">{showServed ? `Já dispensados (${servedCount})` : `A dispensar (${pendingCount})`}</h2>
        {showServed && <p className="text-xs text-slate-500">Itens contínuos (de x em x horas) podem receber nova dispensação a cada dia.</p>}
        {items.length === 0 && <p className="text-sm text-slate-500">{showServed ? "Nada dispensado ainda." : "Nada novo prescrito."}</p>}
        {stock.length === 0 && <p className="text-sm text-amber-700">Cadastre os produtos e dê entrada no estoque para poder dispensar.</p>}
        <ul className="space-y-3">
          {items.map((i) => <DispenseRow key={i.id} item={i} where={where(i)} stock={usableStock} />)}
        </ul>
        <Pager page={page} size={PAGE_SIZE} count={showServed ? servedCount : pendingCount} href={(p) => href({ ala, dispensados: showServed, pagina: p })} />
      </section>
    </div>
  );

  function DispenseRow({ item: i, where, stock }: { item: (typeof items)[number]; where: string; stock: typeof usableStock }) {
    const total = -i.dispensations.reduce((s, d) => s + d.quantity, 0);
    const last = i.dispensations.reduce<Date | null>((m, d) => (!m || d.at > m ? d.at : m), null);
    // Já deixa escolhido o produto cujo nome bate com o que foi prescrito.
    const word = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/)[0];
    const match = stock.find((s) => s.usable > 0 && word(s.product.name) === word(i.description));
    return (
      <li className="rounded-md border border-slate-200 p-3 text-sm">
        <p>
          <strong>{i.patient.socialName || i.patient.name}</strong> <span className="text-slate-500">· {where}</span>
        </p>
        <p>
          {i.description}{[i.dose, i.route, frequencyLabel(i)].filter(Boolean).map((x) => ` · ${x}`)}
          <span className="text-slate-500"> · {displayName(i.prescriber)}, {formatDateTime(i.createdAt)}</span>
        </p>
        {total > 0 && <p className="text-xs text-emerald-700">Dispensado: {total} (último em {formatDateTime(last)})</p>}
        <ActionForm action={dispense.bind(null, i.id)} submitLabel="Dispensar" className="mt-2 flex flex-wrap items-end gap-2">
          <select name="productId" className="input w-auto! min-w-64" defaultValue={match?.product.id ?? ""} required aria-label="Produto">
            <option value="" disabled>Produto do estoque</option>
            {stock.map((s) => (
              <option key={s.product.id} value={s.product.id} disabled={s.usable === 0}>
                {s.product.name}{s.product.presentation && ` ${s.product.presentation}`} (saldo {s.usable})
              </option>
            ))}
          </select>
          <input name="quantity" type="number" min={1} defaultValue={1} className="input w-24!" aria-label="Quantidade" />
        </ActionForm>
      </li>
    );
  }
}
