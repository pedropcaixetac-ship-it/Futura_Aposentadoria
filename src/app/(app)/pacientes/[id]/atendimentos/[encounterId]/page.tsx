import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canAddAddendum, canEditEncounter, canViewClinical } from "@/lib/permissions";
import { age, formatDate, formatDateTime } from "@/lib/format";
import { documentHash, encounterHash, type Diagnosis, type TemplateField } from "@/lib/record";
import { documentTypeLabel } from "@/lib/documents";
import { addAddendum, finalizeEncounter, issueDocument, saveEncounter } from "../../actions";
import { DocumentForm } from "./document-form";
import { SignBox } from "./sign-box";
import { availableProviders } from "@/lib/signature/providers";
import { EncounterEditor } from "./encounter-editor";
import { PrintButton } from "./print-button";

export default async function EncounterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; encounterId: string }>;
  searchParams: Promise<{ assinatura?: string }>;
}) {
  const user = await requireUser();
  const { id, encounterId } = await params;
  const { assinatura } = await searchParams;
  if (!canViewClinical(user)) notFound();

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, patientId: id, clinicId: user.clinicId },
    include: {
      patient: true,
      professional: true,
      template: true,
      addenda: { include: { author: true }, orderBy: { createdAt: "asc" } },
      signedPdf: { select: { id: true, signerName: true, signedAt: true, provider: true } },
      documents: { include: { author: true, signedPdf: { select: { id: true, signerName: true, signedAt: true, provider: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!encounter) notFound();

  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "ATENDIMENTO_VISUALIZADO",
    entity: "Encounter",
    entityId: encounter.id,
    patientId: id,
  });

  const editable = canEditEncounter(user, encounter);
  const canIssueDocuments = encounter.professionalId === user.id;
  const providers = encounter.professionalId === user.id ? availableProviders() : [];
  const snippets = editable
    ? await prisma.textSnippet.findMany({
        where: { ownerId: user.id },
        select: { id: true, fieldKey: true, title: true, text: true },
        orderBy: { title: "asc" },
      })
    : [];

  const fields = encounter.fields as TemplateField[];
  const content = encounter.content as Record<string, string>;
  const diagnoses = encounter.diagnoses as Diagnosis[];
  const { patient, professional } = encounter;
  const intact =
    encounter.status !== "FINALIZADO" ||
    (encounter.finalizedAt && encounter.contentHash === encounterHash({ ...encounter, finalizedAt: encounter.finalizedAt }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
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

      <div className="card space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">{encounter.template?.name ?? "Evolução livre"}</p>
        <h1 className="text-xl font-semibold">
          {patient.name}
          {patient.birthDate && <span className="font-normal text-slate-500"> · {age(patient.birthDate)} anos ({formatDate(patient.birthDate)})</span>}
        </h1>
        <p className="text-sm text-slate-600">
          {formatDateTime(encounter.startedAt)} · {professional.name}
          {professional.councilNumber && ` · ${professional.councilType} ${professional.councilNumber}/${professional.councilUf}`}
        </p>
        {patient.allergies && <p className="text-sm font-semibold text-red-700">Alergias: {patient.allergies}</p>}
      </div>

      {assinatura === "erro" && (
        <p className="no-print rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Não foi possível assinar. Confira se o seu CPF está certo em Assinatura digital e tente de novo.
        </p>
      )}
      {assinatura === "cancelada" && (
        <p className="no-print rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          A assinatura foi cancelada no app do certificado.
        </p>
      )}

      {!intact && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Atenção: o conteúdo deste atendimento não confere com o registrado na finalização. Comunique o administrador.
        </p>
      )}

      {editable ? (
        <EncounterEditor
          fields={fields}
          content={content}
          diagnoses={diagnoses}
          snippets={snippets}
          save={saveEncounter.bind(null, encounter.id)}
          finalize={finalizeEncounter.bind(null, encounter.id)}
        />
      ) : (
        <div className="card space-y-4">
          {encounter.status === "RASCUNHO" && (
            <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">
              Rascunho em andamento. Só {professional.name} pode editar e finalizar.
            </p>
          )}
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
              Finalizado em {formatDateTime(encounter.finalizedAt)} por {professional.name}.
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
                {formatDateTime(a.createdAt)} · {a.author.name}
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
                      <span className="font-normal text-slate-500"> · {formatDateTime(d.createdAt)} · {d.author.name}</span>
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
