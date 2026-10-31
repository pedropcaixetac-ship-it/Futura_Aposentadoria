import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { asFields, MODALITIES, referenceLabel, sectorLabel } from "@/lib/exames";
import { ActionForm } from "../../financeiro/action-form";
import { saveExamType } from "../../exames/actions";

export default async function ExamCatalogPage() {
  const user = await requireUser("laboratorio");
  const types = await prisma.examType.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: [{ sector: "asc" }, { name: "asc" }] });

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/laboratorio" className="text-sm text-marinho-700 hover:underline">← Laboratório</Link>
        <h1 className="mt-1 text-2xl font-semibold">Catálogo de exames</h1>
        <p className="text-sm text-slate-500">Os exames que o hospital faz. É desta lista que o médico pede e a recepção agenda.</p>
      </div>
      {(["LABORATORIO", "IMAGEM"] as const).map((sector) => (
        <section key={sector} className="card space-y-2">
          <h2 className="font-semibold text-marinho-800">{sectorLabel[sector]}</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {types.filter((t) => t.sector === sector).map((t) => (
              <li key={t.id} className="py-2">
                <p className="font-medium">{t.name}{t.modality && <span className="font-normal text-slate-500"> · {t.modality}</span>}{t.sample && <span className="font-normal text-slate-500"> · {t.sample}</span>}</p>
                {asFields(t.fields).length > 0 && <p className="text-xs text-slate-500">{asFields(t.fields).map((f) => `${f.name}${f.unit ? ` (${f.unit})` : ""}${referenceLabel(f) ? ` ${referenceLabel(f)}` : ""}`).join(" · ")}</p>}
                {t.preparation && <p className="text-xs text-slate-500">Preparo: {t.preparation}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <ActionForm action={saveExamType} submitLabel="Cadastrar exame">
        <h2 className="font-semibold text-marinho-800">Novo exame</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="sector">Setor</label>
            <select className="input" id="sector" name="sector" defaultValue="LABORATORIO">
              <option value="LABORATORIO">Laboratório</option>
              <option value="IMAGEM">Imagem</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="name">Nome</label>
            <input className="input" id="name" name="name" required placeholder="Ex.: Hemograma completo" />
          </div>
          <div>
            <label className="label" htmlFor="sample">Amostra (laboratório)</label>
            <input className="input" id="sample" name="sample" placeholder="Ex.: sangue, tubo roxo (EDTA)" />
          </div>
          <div>
            <label className="label" htmlFor="modality">Modalidade (imagem)</label>
            <select className="input" id="modality" name="modality" defaultValue="">
              <option value="">—</option>
              {MODALITIES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="preparation">Preparo do paciente</label>
            <input className="input" id="preparation" name="preparation" placeholder="Ex.: jejum de 8 horas" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="fields">Campos do resultado (laboratório): um por linha, &quot;nome; unidade; mínimo; máximo&quot;</label>
            <textarea className="input min-h-28 font-mono text-xs" id="fields" name="fields" placeholder={"Hemoglobina; g/dL; 12; 16\nLeucócitos; /mm³; 4000; 11000"} />
          </div>
        </div>
      </ActionForm>
    </div>
  );
}
