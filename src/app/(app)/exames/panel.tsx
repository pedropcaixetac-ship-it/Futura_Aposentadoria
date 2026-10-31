import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { isPhysician } from "@/lib/pronto-socorro";
import { sectorLabel } from "@/lib/exames";
import { ActionForm } from "../financeiro/action-form";
import { requestExams, type ExamContext } from "./actions";
import { ResultView } from "./result-view";
import { ExamBadge } from "./status-badge";

const people = { select: { name: true, sex: true, jobTitle: true } } as const;

// Exames do paciente internado ou no PS: o médico pede, e os resultados aparecem aqui quando liberados.
export async function ExamPanel({ ctx, user, open }: { ctx: ExamContext; user: CurrentUser; open: boolean }) {
  const where = ctx.kind === "internacao" ? { admissionId: ctx.id } : { emergencyVisitId: ctx.id };
  const [exams, catalog] = await Promise.all([
    prisma.examRequest.findMany({
      where: { clinicId: user.clinicId, ...where },
      include: { examType: { select: { name: true, sector: true } }, requestedBy: people, resultBy: people },
      orderBy: { createdAt: "desc" },
    }),
    open && isPhysician(user) ? prisma.examType.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: [{ sector: "asc" }, { name: "asc" }] }) : [],
  ]);
  const pending = exams.filter((e) => e.status !== "LAUDADO" && e.status !== "CANCELADO").length;

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold text-marinho-800">Exames</h2>
        {pending > 0 && <p className="text-xs text-slate-500">{pending} aguardando resultado.</p>}
      </div>
      {exams.length === 0 && <p className="text-sm text-slate-500">Nenhum exame pedido.</p>}
      <ul className="space-y-3">
        {exams.map((e) => (
          <li key={e.id} className="space-y-1 rounded-md border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{e.examType.name}</strong>
              <ExamBadge status={e.status} priority={e.priority} />
              <span className="text-xs text-slate-500">{e.requestedBy ? displayName(e.requestedBy) : e.externalRequester}, {formatDateTime(e.createdAt)}</span>
            </div>
            {e.status === "LAUDADO" && <ResultView exam={e} />}
            {e.status === "CANCELADO" && <p className="text-xs text-slate-500">Cancelado: {e.cancelReason}</p>}
          </li>
        ))}
      </ul>
      {catalog.length > 0 && (
        <ActionForm action={requestExams.bind(null, ctx)} submitLabel="Pedir exames" className="space-y-3 border-t border-slate-100 pt-3">
          <p className="font-medium">Pedir exames</p>
          {(["LABORATORIO", "IMAGEM"] as const).map((sector) => {
            const list = catalog.filter((t) => t.sector === sector);
            return list.length > 0 && (
              <fieldset key={sector} className="space-y-1">
                <legend className="text-xs uppercase text-slate-500">{sectorLabel[sector]}</legend>
                <div className="grid gap-1 sm:grid-cols-3">
                  {list.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="examTypeId" value={t.id} /> {t.name}</label>
                  ))}
                </div>
              </fieldset>
            );
          })}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="priority" value="URGENTE" /> Urgente</label>
            <input name="clinicalInfo" className="input w-auto! min-w-80 grow" placeholder="Indicação clínica (ex.: febre, suspeita de pneumonia)" aria-label="Indicação clínica" />
          </div>
        </ActionForm>
      )}
    </section>
  );
}
