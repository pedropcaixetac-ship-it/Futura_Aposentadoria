import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canEditEncounter, canViewClinical } from "@/lib/permissions";
import { age, formatCpf, formatDate, formatDateTime } from "@/lib/format";
import type { Diagnosis, TemplateField } from "@/lib/record";
import {
  encounterTexts,
  excerpt,
  filterEncounters,
  filtersQuery,
  FREE_TEMPLATE,
  groupByYear,
  hasFilters,
  parseHistoryFilters,
} from "@/lib/history";
import { updateClinicalSummary } from "../actions";
import { startEncounter } from "./actions";
import { ClinicalSummary } from "./clinical-summary";
import { EncounterContent, Marked } from "./encounter-content";

export default async function PatientRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const filters = parseHistoryFilters(await searchParams);
  const filtered = hasFilters(filters);
  const patient = await prisma.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!patient) notFound();

  const clinical = canViewClinical(user);
  const [encounters, templates] = clinical
    ? await Promise.all([
        prisma.encounter.findMany({
          where: { patientId: id, clinicId: user.clinicId },
          include: {
            professional: true,
            template: true,
            addenda: { include: { author: true }, orderBy: { createdAt: "asc" } },
          },
          orderBy: { startedAt: "desc" },
        }),
        prisma.recordTemplate.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } }),
      ])
    : [[], []];

  if (clinical) {
    await audit({
      clinicId: user.clinicId,
      userId: user.id,
      action: filtered ? "HISTORICO_PESQUISADO" : "PRONTUARIO_VISUALIZADO",
      entity: "Patient",
      entityId: id,
      patientId: id,
      ...(filtered && { details: filters }),
    });
  }

  const shown = filterEncounters(encounters, filters);
  // Opções dos filtros: só quem atendeu e os tipos usados neste paciente.
  const professionals = [...new Map(encounters.map((e) => [e.professional.id, e.professional])).values()];
  const kinds = [
    ...new Map(encounters.map((e) => [e.templateId ?? FREE_TEMPLATE, { id: e.templateId ?? FREE_TEMPLATE, name: e.template?.name ?? "Evolução livre" }])).values(),
  ];

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{patient.socialName || patient.name}</h1>
          {patient.socialName && <p className="text-sm text-slate-500">Nome de registro: {patient.name}</p>}
          <p className="mt-1 text-sm text-slate-600">
            {[
              patient.birthDate && `${age(patient.birthDate)} anos (${formatDate(patient.birthDate)})`,
              patient.cpf && `CPF ${formatCpf(patient.cpf)}`,
              patient.phone,
              patient.insurance && `${patient.insurance}${patient.insuranceNumber ? ` · ${patient.insuranceNumber}` : ""}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Link href={`/pacientes/${id}/editar`} className="btn-secondary">Editar cadastro</Link>
      </div>

      {!clinical && (
        <p className="card text-sm text-slate-500">
          O conteúdo clínico do prontuário é visível apenas para profissionais de saúde.
        </p>
      )}

      {clinical && (
        <>
          <ClinicalSummary
            summary={{
              allergies: patient.allergies,
              currentMedications: patient.currentMedications,
              personalHistory: patient.personalHistory,
              familyHistory: patient.familyHistory,
            }}
            action={updateClinicalSummary.bind(null, id)} />

          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Histórico de atendimentos</h2>
              <form action={startEncounter.bind(null, id)} className="flex flex-wrap items-center gap-2">
                <select name="templateId" aria-label="Modelo de atendimento" className="input w-auto!">
                  <option value="">Evolução livre</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button className="btn-primary">+ Novo atendimento</button>
              </form>
            </div>

            {encounters.length > 0 && (
              <form className="grid gap-3 rounded-md bg-marinho-50/60 p-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="label" htmlFor="palavra">Procurar no histórico</label>
                  <input id="palavra" name="palavra" type="search" defaultValue={filters.palavra} className="input"
                    placeholder="Uma palavra ou expressão, ex.: dipirona, cefaleia, pressão alta" />
                </div>
                <div>
                  <label className="label" htmlFor="profissional">Profissional</label>
                  <select id="profissional" name="profissional" defaultValue={filters.profissional} className="input">
                    <option value="">Todos</option>
                    {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="modelo">Tipo de atendimento</label>
                  <select id="modelo" name="modelo" defaultValue={filters.modelo} className="input">
                    <option value="">Todos</option>
                    {kinds.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="cid">Diagnóstico (CID)</label>
                  <input id="cid" name="cid" defaultValue={filters.cid} placeholder="Ex.: J45 ou I10" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="de">De</label>
                  <input id="de" name="de" type="date" defaultValue={filters.de} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="ate">Até</label>
                  <input id="ate" name="ate" type="date" defaultValue={filters.ate} className="input" />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <button className="btn-primary">Filtrar</button>
                  {filtered && <Link href={`/pacientes/${id}`} className="btn-secondary">Limpar</Link>}
                </div>
              </form>
            )}

            {encounters.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                <span>
                  {filtered
                    ? `${shown.length} de ${encounters.length} atendimento${encounters.length > 1 ? "s" : ""}`
                    : `${encounters.length} atendimento${encounters.length > 1 ? "s" : ""}`}
                </span>
                <Link href={`/pacientes/${id}/historico${filtersQuery(filters)}`} target="_blank" className="btn-secondary">
                  {filtered ? "Imprimir resultado" : "Imprimir histórico"}
                </Link>
              </div>
            )}

            {encounters.length === 0 && <p className="text-sm text-slate-400">Nenhum atendimento registrado.</p>}
            {encounters.length > 0 && shown.length === 0 && (
              <p className="text-sm text-slate-400">Nenhum atendimento encontrado com esses filtros.</p>
            )}

            {groupByYear(shown).map((group) => (
              <section key={group.year} className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-marinho-800">
                  <span className="rounded bg-marinho-700 px-2 py-0.5 text-white">{group.year}</span>
                  <span className="font-normal text-slate-500">
                    {group.items.length} atendimento{group.items.length > 1 ? "s" : ""}
                  </span>
                </h3>
                <ol className="space-y-2 border-l-2 border-dourado-300 pl-4">
                  {group.items.map((e) => {
                    const fields = e.fields as TemplateField[];
                    const content = e.content as Record<string, string>;
                    const diagnoses = e.diagnoses as Diagnosis[];
                    const preview =
                      (filters.palavra && excerpt(encounterTexts(e), filters.palavra)) ||
                      fields.map((f) => content[f.key]).find(Boolean);
                    return (
                      <li key={e.id}>
                        <details className="group rounded-md border border-slate-200 open:border-marinho-400">
                          <summary className="cursor-pointer list-none p-4 hover:bg-marinho-50/30">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="inline-block text-marinho-600 transition group-open:rotate-90">▸</span>
                              <span className="font-medium">{formatDateTime(e.startedAt)}</span>
                              <span className="text-slate-500">· {e.template?.name ?? "Evolução livre"} · {e.professional.name}</span>
                              {e.status === "RASCUNHO" ? (
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Rascunho</span>
                              ) : (
                                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Finalizado</span>
                              )}
                              {e.addenda.length > 0 && (
                                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                  {e.addenda.length} adendo{e.addenda.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                            {diagnoses.length > 0 && (
                              <p className="mt-1 text-sm text-slate-600">
                                {diagnoses.map((d) => `${d.code} ${d.description}`).join("; ")}
                              </p>
                            )}
                            {preview && (
                              <p className="mt-1 line-clamp-2 text-sm text-slate-500 group-open:hidden">
                                <Marked text={preview} term={filters.palavra} />
                              </p>
                            )}
                          </summary>
                          <div className="space-y-3 border-t border-slate-100 p-4">
                            <EncounterContent encounter={e} term={filters.palavra} />
                            <Link href={`/pacientes/${id}/atendimentos/${e.id}`} className="inline-block text-sm text-marinho-700 hover:underline">
                              {canEditEncounter(user, e) ? "Continuar editando →" : "Abrir atendimento →"}
                            </Link>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
