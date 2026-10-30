import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canEditEncounter, canManageCharges, canViewClinical, canWorkClinical } from "@/lib/permissions";
import { age, formatCpf, formatDate, formatDateTime, formatPhone } from "@/lib/format";
import { canMessage } from "@/lib/whatsapp";
import { listUsableTemplates } from "@/lib/templates";
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
import { startEncounter, startTeleconsultation } from "./actions";
import { ClinicalSummary } from "./clinical-summary";
import { EncounterContent, Marked } from "./encounter-content";
import { PatientDetails } from "./patient-details";
import { WhatsappButton } from "./whatsapp-button";
import { displayName } from "@/lib/staff";
import { availableProviders } from "@/lib/signature/providers";
import { SignBox } from "./atendimentos/[encounterId]/sign-box";

export default async function PatientRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("pacientes");
  const { id } = await params;
  const filters = parseHistoryFilters(await searchParams);
  const filtered = hasFilters(filters);
  const patient = await prisma.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!patient) notFound();

  // full: acesso completo ao prontuário. clinical: completo ou restrito (técnico/auxiliar de enfermagem),
  // que só vê os próprios atendimentos.
  const full = canViewClinical(user);
  const clinical = canWorkClinical(user);
  const canWhatsapp = canMessage(patient);
  const [encounters, templates] = clinical
    ? await Promise.all([
        prisma.encounter.findMany({
          where: { patientId: id, clinicId: user.clinicId, ...(!full && { professionalId: user.id }) },
          include: {
            professional: true,
            template: true,
            teleconsultation: { select: { id: true } },
            addenda: { include: { author: true }, orderBy: { createdAt: "asc" } },
          },
          orderBy: { startedAt: "desc" },
        }),
        listUsableTemplates(user),
      ])
    : [[], { mine: [], clinic: [] }];

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

  // Última cópia assinada do prontuário completo (sem atendimento nem documento ligado).
  const signedCopy = full
    ? await prisma.signedPdf.findFirst({
        where: { patientId: id, clinicId: user.clinicId, encounterId: null, documentId: null },
        select: { id: true, signerName: true, signedAt: true, provider: true },
        orderBy: { signedAt: "desc" },
      })
    : null;

  const shown = filterEncounters(encounters, filters);
  // Opções dos filtros: só quem atendeu e os tipos usados neste paciente.
  const professionals = [...new Map(encounters.map((e) => [e.professional.id, e.professional])).values()];
  const kinds = [
    ...new Map(encounters.map((e) => [e.templateId ?? FREE_TEMPLATE, { id: e.templateId ?? FREE_TEMPLATE, name: e.template?.name ?? "Evolução livre" }])).values(),
  ];


  return (
    <div className="space-y-5">
      {!patient.registrationComplete && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dourado-300 bg-dourado-100 px-4 py-3 text-sm text-dourado-700">
          <span>Cadastro incompleto: este paciente foi registrado pelo cadastro rápido.</span>
          <Link href={`/pacientes/${id}/editar`} className="font-medium underline">Completar cadastro</Link>
        </div>
      )}

      <div className="card flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {patient.photo && (
            // eslint-disable-next-line @next/next/no-img-element -- foto guardada como data URL
            <img src={patient.photo} alt="" className="h-16 w-16 shrink-0 rounded-full border-2 border-dourado-300 object-cover" />
          )}
          <div>
            <h1 className="text-2xl font-semibold">{patient.socialName || patient.name}</h1>
            {patient.socialName && <p className="text-sm text-slate-500">Nome de registro: {patient.name}</p>}
            <p className="mt-1 text-sm text-slate-600">
              {[
                patient.birthDate && `${age(patient.birthDate)} anos (${formatDate(patient.birthDate)})`,
                patient.cpf && `CPF ${formatCpf(patient.cpf)}`,
                patient.phone && formatPhone(patient.phone),
                patient.insurance && `${patient.insurance}${patient.insuranceNumber ? ` · ${patient.insuranceNumber}` : ""}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWhatsapp && <WhatsappButton patientId={id} />}
          {canManageCharges(user) && (
            <Link href={`/financeiro/receitas/nova?paciente=${id}`} className="btn-secondary">Nova cobrança</Link>
          )}
          <Link href={`/agenda/novo?paciente=${id}`} className="btn-secondary">Agendar consulta</Link>
          {full && (
            <a href={`/api/pdf/prontuario/${id}`} target="_blank" className="btn-secondary">Gerar PDF do prontuário</a>
          )}
          {full && (
            <SignBox
              target={{ kind: "prontuario", id }}
              signed={null}
              canSign
              providers={availableProviders()}
              back={`/pacientes/${id}`}
              label="Assinar prontuário"
            />
          )}
          {signedCopy && (
            <a href={`/api/pdf/assinado/${signedCopy.id}`} target="_blank" className="text-sm text-emerald-700 underline"
              title={`Assinado por ${signedCopy.signerName}`}>
              ✓ Cópia assinada de {formatDateTime(signedCopy.signedAt)}{signedCopy.provider === "TESTE" ? " (teste)" : ""}
            </a>
          )}
          <Link href={`/pacientes/${id}/editar`} className="btn-secondary">Editar cadastro</Link>
        </div>
        {!patient.whatsappOptIn && (
          <p className="w-full text-xs text-slate-500">
            Sem autorização para mensagens pelo WhatsApp. Para ativar, marque a opção em &quot;Editar cadastro&quot;.
          </p>
        )}
        {patient.whatsappOptIn && !canWhatsapp && (
          <p className="w-full text-xs text-amber-700">
            O paciente autorizou o WhatsApp, mas o celular do cadastro não tem WhatsApp ou não é válido.
          </p>
        )}
      </div>

      <PatientDetails patient={patient} />

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
            action={full ? updateClinicalSummary.bind(null, id) : undefined} />

          {!full && (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
              Seu perfil tem acesso restrito: você vê o resumo clínico e só os atendimentos feitos por você.
              As consultas dos outros profissionais não aparecem.
            </p>
          )}

          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Histórico de atendimentos</h2>
              <form action={startEncounter.bind(null, id)} className="flex flex-wrap items-center gap-2">
                {/* Se o profissional tem um modelo só, ele já vem escolhido. */}
                <select name="templateId" aria-label="Modelo de atendimento" className="input w-auto!"
                  defaultValue={templates.mine.length === 1 ? templates.mine[0].id : ""}>
                  <option value="">Evolução livre</option>
                  {templates.mine.length > 0 && (
                    <optgroup label="Meus modelos">
                      {templates.mine.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  )}
                  {templates.clinic.length > 0 && (
                    <optgroup label="Modelos da clínica">
                      {templates.clinic.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  )}
                </select>
                <button className="btn-primary">+ Novo atendimento</button>
                {full && <button formAction={startTeleconsultation.bind(null, id)} className="btn-secondary">+ Teleconsulta</button>}
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
                    {professionals.map((p) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
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
                {full && (
                  <Link href={`/pacientes/${id}/historico${filtersQuery(filters)}`} target="_blank" className="btn-secondary">
                    {filtered ? "Imprimir resultado" : "Imprimir histórico"}
                  </Link>
                )}
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
                              <span className="text-slate-500">· {e.template?.name ?? "Evolução livre"} · {displayName(e.professional)}</span>
                              {e.status === "RASCUNHO" ? (
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Rascunho</span>
                              ) : (
                                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Finalizado</span>
                              )}
                              {e.teleconsultation && (
                                <span className="rounded bg-marinho-50 px-2 py-0.5 text-xs text-marinho-700">Teleconsulta</span>
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
