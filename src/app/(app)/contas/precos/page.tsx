import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { moneyInput } from "@/lib/money";
import { priceKey } from "@/lib/conta-hospitalar";
import { ActionForm } from "../../financeiro/action-form";
import { savePrices } from "../actions";
import { BillsNav } from "../nav";

function PriceRow({ label, k, prices }: { label: string; k: string; prices: Map<string, number> }) {
  const cents = prices.get(k);
  return (
    <div className="grid grid-cols-[1fr_8rem] items-center gap-3 py-1.5">
      <label htmlFor={`p_${k}`} className="text-sm">{label}</label>
      <input className="input text-right" id={`p_${k}`} name={`p_${k}`} defaultValue={cents === undefined ? "" : moneyInput(cents)} placeholder="sem preço" inputMode="decimal" />
    </div>
  );
}

// Tabela própria do hospital: diária por tipo de ala, hora de sala cirúrgica, exames e medicamentos.
export default async function PricesPage() {
  const user = await requireUser("contas");
  const [wards, exams, products, saved] = await Promise.all([
    prisma.ward.findMany({ where: { clinicId: user.clinicId, active: true }, select: { kind: true }, distinct: ["kind"], orderBy: { kind: "asc" } }),
    prisma.examType.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: [{ sector: "asc" }, { name: "asc" }] }),
    prisma.pharmacyProduct.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } }),
    prisma.hospitalPrice.findMany({ where: { clinicId: user.clinicId } }),
  ]);
  const prices = new Map(saved.map((p) => [p.key, p.priceCents]));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas hospitalares</h1>
        <p className="text-sm text-slate-500">Preços do hospital (particular). Deixe em branco o que não tem preço. As contas abertas usam os preços novos assim que salvar.</p>
      </div>
      <BillsNav current="precos" />
      <ActionForm action={savePrices} submitLabel="Salvar tabela de preços" resetOnSuccess={false}>
        <section>
          <h2 className="font-semibold text-marinho-800">Diárias (por tipo de ala)</h2>
          <div className="divide-y divide-slate-100">
            {wards.length === 0 && <p className="py-2 text-sm text-slate-500">Nenhuma ala cadastrada.</p>}
            {wards.map((w) => <PriceRow key={w.kind} label={`Diária de ${w.kind.toLowerCase()}`} k={priceKey.diaria(w.kind)} prices={prices} />)}
          </div>
        </section>
        <section>
          <h2 className="font-semibold text-marinho-800">Centro cirúrgico</h2>
          <PriceRow label="Taxa de sala, por hora" k={priceKey.sala} prices={prices} />
        </section>
        <section>
          <h2 className="font-semibold text-marinho-800">Exames</h2>
          <div className="divide-y divide-slate-100">
            {exams.length === 0 && <p className="py-2 text-sm text-slate-500">Nenhum exame no catálogo.</p>}
            {exams.map((e) => <PriceRow key={e.id} label={`${e.name}${e.modality ? ` (${e.modality})` : ""}`} k={priceKey.exame(e.id)} prices={prices} />)}
          </div>
        </section>
        <section>
          <h2 className="font-semibold text-marinho-800">Medicamentos e materiais (por unidade dispensada)</h2>
          <div className="divide-y divide-slate-100">
            {products.length === 0 && <p className="py-2 text-sm text-slate-500">Nenhum produto na farmácia.</p>}
            {products.map((p) => <PriceRow key={p.id} label={`${p.name}${p.presentation ? ` ${p.presentation}` : ""} (${p.unit})`} k={priceKey.med(p.id)} prices={prices} />)}
          </div>
        </section>
      </ActionForm>
    </div>
  );
}
