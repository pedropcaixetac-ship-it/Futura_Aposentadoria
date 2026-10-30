import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canAddAddendum, canEditEncounter, canOpenEncounter, canViewClinical, canWorkClinical } from "@/lib/permissions";
import { age, formatDate, formatDateTime } from "@/lib/format";
import { documentHash, encounterHash, type Diagnosis, type TemplateField } from "@/lib/record";
import { documentTypeLabel } from "@/lib/documents";
import { addAddendum, autosaveEncounter, issueDocument } from "../../actions";
import { updateClinicalSummary } from "../../../actions";
import type { Vitals } from "@/lib/vitals";
import { DocumentForm } from "./document-form";
import { SignBox } from "./sign-box";
import { availableProviders } from "@/lib/signature/providers";
import { EncounterEditor } from "./encounter-editor";
import { PrintButton } from "./print-button";
import { PatientHistory } from "./patient-history";
import { VitalsView } from "./vitals-view";
import { displayName } from "@/lib/staff";
import { TeleconsultaPanel } from "./teleconsulta-panel";
import { TeleconsultaRecord } from "./teleconsulta-record";
import { endTeleconsultation, joinTeleconsultation, teleconsultationStatus } from "./teleconsulta-actions";
import { teleconsultationPath, teleconsultationState } from "@/lib/teleconsulta";
import { siteOrigin } from "@/lib/teleconsulta-sala";
import { videoConfigured } from "@/lib/video";

export default async function EncounterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; encounterId: string }>;
  searchParams: Promise<{ assinatura?: string; finalizado?: string }>;
}) {
  const user = await requireUser("pacientes");
  const { id, encounterId } = await params;
  const { assinatura, finalizado } = await searchParams;
  if (!canWorkClinical(user)) notFound();
  // Acesso restrito (técnico/auxiliar de enfermagem): só os próprios atendimentos e sem documentos clínicos.
  const full = canViewClinical(user);

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, patientId: id, clinicId: user.clinicId },
    include: {
      patient: true,
      professional: true,
      template: true,
      teleconsultation: true,
      addenda: { include: { author: true }, orderBy: { createdAt: "asc" } },
      signedPdf: { select: { id: true, signerName: true, signedAt: true, provider: true } },
      documents: { include: { author: true, signedPdf: { select: { id: true, signerName: true, signedAt: true, provider: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!encounter || !canOpenEncounter(user, encounter)) notFound();

  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "ATENDIMENTO_VISUALIZADO",
    entity: "Encounter",
    entityId: encounter.id,
    patientId: id,
  });

  const editable = canEditEncounter(user, encounter);
  const canIssueDocuments = full && encounter.professionalId === user.id;
  const providers = encounter.professionalId === user.id ? availableProviders() : [];
  const snippets = editable
    ? await prisma.textSnippet.findMany({
        where: { ownerId: user.id },
        select: { id: true, fieldKey: true, title: true, text: true },
        orderBy: { title: "asc" },
      })
    : [];

  const history = editable
    ? await prisma.encounter.findMany({
        where: { patientId: id, clinicId: user.clinicId, status: "FINALIZADO", id: { not: encounter.id }, ...(!full && { professionalId: user.id }) },
        include: { professional: true, template: true },
        orderBy: { startedAt: "desc" },
        take: 30,
      })
    : [];

  // "Copiar da última consulta" usa a última do próprio profissional; se não houver, a última de qualquer um.
  const last = history.find((e) => e.professionalId === user.id) ?? history[0];

  const fields = encounter.fields as TemplateField[];
  const content = encounter.content as Record<string, string>;
  const diagnoses = encounter.diagnoses as Diagnosis[];
  const vitals = encounter.vitals as Vitals | null;
  const { patient, professional } = encounter;
  const intact =
    encounter.status !== "FINALIZADO" ||
    (encounter.finalizedAt && encounter.contentHash === encounterHash({ ...encounter, finalizedAt: encounter.finalizedAt }));

  const tele = encounter.teleconsultation;
  const teleState = tele && teleconsultationState(tele);
  // O painel do vídeo aparece só para o profissional responsável, enquanto o link vale.
  const telePanel =
    tele && tele.professionalId === user.id && (teleState === "AGUARDANDO_TERMO" || teleState === "LIBERADA") ? (
      <TeleconsultaPanel
        link={`${await siteOrigin()}${teleconsultationPath(tele.token)}`}
        patientName={patient.socialName || patient.name}
        phone={patient.phone}
        initialConsentAt={tele.consentAt?.toISOString() ?? null}
        initialPatientJoinedAt={tele.patientJoinedAt?.toISOString() ?? null}
        configured={videoConfigured()}
        status={teleconsultationStatus.bind(null, tele.id)}
        join={joinTeleconsultation.bind(null, tele.id)}
        end={endTeleconsultation.bind(null, tele.id)}
      />
    ) : null;

  return (
    <div className={editable ? "space-y-4" : "mx-auto max-w-3xl space-y-4"}>
      <div className="no-print flex items-center justify-between">
        <Link href={`/pacientes/${id}`} className="text-sm text-marinho-700 hover:underline">← Voltar ao prontuário</Link>
        {encounter.status === "FINALIZADO" && (
          <div className="flex flex-wrap justify-end gap-2">
            <SignBox
              target={{ kind: "atendimento", id: encounter.id }}
              signed={encounter.signedPdf}
              canSign={encounter.professionalId === user.id}
              providers={providers}
            />
            <a href={`/api/pdf/atendimento/${encounter.id}`} target="_blank" className="btn-secondary">Baixar PDF</a>
            <PrintButton />
          </div>
        )}
      </div>

      {!editable && (
        <div className="card space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">{encounter.template?.name ?? "Evolução livre"}</p>
          <h1 className="text-xl font-semibold">
            {patient.name}
            {patient.birthDate && <span className="font-normal text-slate-500"> · {age(patient.birthDate)} anos ({formatDate(patient.birthDate)})</span>}
          </h1>
          <p className="text-sm text-slate-600">
            {formatDateTime(encounter.startedAt)} · {displayName(professional)}
            {professional.councilNumber && ` · ${professional.councilType} ${professional.councilNumber}/${professional.councilUf}`}
          </p>
          {patient.allergies && <p className="text-sm font-semibold text-red-700">Alergias: {patient.allergies}</p>}
        </div>
      )}

      {finalizado && encounter.status === "FINALIZADO" && (
        <p className="no-print rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          ✓ Atendimento finalizado.
          {!encounter.signedPdf && providers.length > 0 && " Falta assinar o registro do atendimento: use o botão Assinar acima."}
        </p>
      )}

      {assinatura === "erro" && (
        <p className="no-print rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Não foi possível assinar. Confira em Meu cadastro se o seu CPF é o mesmo do certificado (se estiver errado, peça ao administrador) e tente de novo.
        </p>
      )}
      {assinatura === "cancelada" && (
        <p className="no-print rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          A assinatura foi cancelada no app do certificado.
        </p>
      )}

      {tele && <TeleconsultaRecord tele={tele} />}
      {!editable && telePanel}

      {!intact && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Atenção: o conteúdo deste atendimento não confere com o registrado na finalização. Comunique o administrador.
        </p>
      )}

      {editable ? (
        <div className={`grid grid-cols-1 gap-4 lg:items-start ${telePanel ? "lg:grid-cols-[minmax(0,1fr)_420px]" : "lg:grid-cols-[minmax(0,1fr)_320px]"}`}>
          <EncounterEditor
            patient={{
              name: patient.socialName || patient.name,
              ageLine: patient.birthDate ? `${age(patient.birthDate)} anos (${formatDate(patient.birthDate)})` : null,
              insurance: patient.insurance,
              allergies: patient.allergies,
            }}
            startedAt={encounter.startedAt.toISOString()}
            heading={`${encounter.template?.name ?? "Evolução livre"} · ${displayName(professional)}`}
            fields={fields}
            content={content}
            diagnoses={diagnoses}
            vitals={vitals}
            snippets={snippets}
            lastEncounter={
              last
                ? {
                    when: formatDateTime(last.startedAt),
                    professionalName: displayName(last.professional),
                    fields: last.fields as TemplateField[],
                    content: last.content as Record<string, string>,
                    diagnoses: last.diagnoses as Diagnosis[],
                  }
                : null
            }
            autosave={autosaveEncounter.bind(null, encounter.id)}
            reviewHref={`/pacientes/${id}/atendimentos/${encounter.id}/revisao`}
          />
          <div className="space-y-4">
          {telePanel}
          <PatientHistory
            patientId={id}
            summary={patient}
            updateSummary={full ? updateClinicalSummary.bind(null, id) : undefined}
            encounters={history.map((e) => ({
              id: e.id,
              startedAt: e.startedAt,
              templateName: e.template?.name ?? null,
              professionalName: displayName(e.professional),
              fields: e.fields as TemplateField[],
              content: e.content as Record<string, string>,
              diagnoses: e.diagnoses as Diagnosis[],
              vitals: e.vitals as Vitals | null,
            }))}
          />
          </div>
        </div>
      ) : (
        <div className="card space-y-4">
          {encounter.status === "RASCUNHO" && (
            <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">
              Rascunho em andamento. Só {displayName(professional)} pode editar e finalizar.
            </p>
          )}
          <VitalsView vitals={vitals} />
          {fields.map((f) => (
            <section key={f.key}>
              <h2 className="text-sm font-semibold text-slate-700">{f.label}</h2>
              <p className="whitespace-pre-wrap text-sm">{content[f.key] || <span className="text-slate-400">—</span>}</p>
            </section>
          ))}
          {diagnoses.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-700">Diagnósticos (CID-10)</h2>
              <ul className="text-sm">
                {diagnoses.map((d) => (
                  <li key={d.code}><strong>{d.code}</strong> {d.description}</li>
                ))}
              </ul>
            </section>
          )}
          {encounter.finalizedAt && (
            <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
              Finalizado em {formatDateTime(encounter.finalizedAt)} por {displayName(professional)}.
              <br />
              Código de integridade: <span className="font-mono">{encounter.contentHash?.slice(0, 16)}</span>
            </p>
          )}
        </div>
      )}

      {encounter.addenda.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Adendos</h2>
          {encounter.addenda.map((a) => (
            <div key={a.id} className="border-l-2 border-dourado-500 pl-3">
              <p className="text-xs text-slate-500">
                {formatDateTime(a.createdAt)} · {displayName(a.author)}
                {a.author.councilNumber && ` · ${a.author.councilType} ${a.author.councilNumber}/${a.author.councilUf}`}
              </p>
              <p className="whitespace-pre-wrap text-sm">{a.text}</p>
            </div>
          ))}
        </div>
      )}

      {(encounter.documents.length > 0 || canIssueDocuments) && (
        <div className="no-print card space-y-3">
          <h2 className="font-semibold">Receitas, atestados e pedidos</h2>
          {encounter.documents.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {encounter.documents.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {documentTypeLabel[d.type]}
                      <span className="font-normal text-slate-500"> · {formatDateTime(d.createdAt)} · {displayName(d.author)}</span>
                    </p>
                    <p className="truncate text-sm text-slate-600">{d.body.split("\n").find((l) => l.trim())}</p>
                    {d.contentHash !== documentHash(d) && (
                      <p className="text-xs font-semibold text-red-700">Atenção: este documento não confere com o emitido.</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <SignBox
                      target={{ kind: "documento", id: d.id }}
                      signed={d.signedPdf}
                      canSign={d.authorId === user.id}
                      providers={providers}
                    />
                    <a href={`/api/pdf/documento/${d.id}`} target="_blank" className="btn-secondary">PDF</a>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {canIssueDocuments && <DocumentForm issue={issueDocument.bind(null, encounter.id)} />}
        </div>
      )}

      {canAddAddendum(user, encounter) && (
        <form action={addAddendum.bind(null, encounter.id)} className="no-print card space-y-2">
          <label className="label" htmlFor="text">Adicionar adendo</label>
          <p className="text-xs text-slate-500">
            Use para corrigir ou complementar este atendimento. O texto original continua guardado como estava.
          </p>
          <textarea className="input" id="text" name="text" rows={3} required />
          <button className="btn-secondary">Adicionar adendo</button>
        </form>
      )}
    </div>
  );
}
