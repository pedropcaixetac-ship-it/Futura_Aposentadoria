import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canAddAddendum, canEditEncounter, canViewClinical } from "@/lib/permissions";
import { age, formatDate, formatDateTime } from "@/lib/format";
import { encounterHash, type Diagnosis, type TemplateField } from "@/lib/record";
import { addAddendum, finalizeEncounter, saveEncounter } from "../../actions";
import { EncounterEditor } from "./encounter-editor";
import { PrintButton } from "./print-button";
import { TeleconsultaPanel } from "./teleconsulta-panel";
import { endTeleconsultation, joinTeleconsultation, teleconsultationStatus } from "./teleconsulta-actions";
import { teleconsultationPath, teleconsultationState } from "@/lib/teleconsulta";
import { siteOrigin } from "@/lib/teleconsulta-sala";
import { videoConfigured } from "@/lib/video";

export default async function EncounterPage({ params }: { params: Promise<{ id: string; encounterId: string }> }) {
  const user = await requireUser();
  const { id, encounterId } = await params;
  if (!canViewClinical(user)) notFound();

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, patientId: id, clinicId: user.clinicId },
    include: {
      patient: true,
      professional: true,
      template: true,
      teleconsultation: true,
      addenda: { include: { author: true }, orderBy: { createdAt: "asc" } },
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

  const tele = encounter.teleconsultation;
  const teleState = tele && teleconsultationState(tele);
  // O painel do vídeo aparece só para o profissional responsável, enquanto o link vale.
  const showPanel = !!tele && tele.professionalId === user.id && (teleState === "AGUARDANDO_TERMO" || teleState === "LIBERADA");

  const main = (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/pacientes/${id}`} className="text-sm text-marinho-700 hover:underline">← Voltar ao prontuário</Link>
        {encounter.status === "FINALIZADO" && <PrintButton />}
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

      {tele && (
        <div className="card space-y-1 text-sm">
          <h2 className="font-semibold">Atendimento por teleconsulta</h2>
          <p className="text-slate-600">Realizado a distância, por vídeo, conforme a Resolução CFM nº 2.314/2022. A chamada não foi gravada.</p>
          <p className="text-slate-600">
            {tele.consentAt
              ? `Termo de consentimento aceito pelo paciente em ${formatDateTime(tele.consentAt)}${tele.consentIp ? ` (IP ${tele.consentIp})` : ""}.`
              : "O paciente ainda não aceitou o termo de consentimento."}
          </p>
          {(tele.professionalJoinedAt || tele.patientJoinedAt || tele.endedAt) && (
            <p className="text-slate-600">
              {[
                tele.professionalJoinedAt && `Profissional entrou: ${formatDateTime(tele.professionalJoinedAt)}`,
                tele.patientJoinedAt && `Paciente entrou: ${formatDateTime(tele.patientJoinedAt)}`,
                tele.endedAt && `Encerrada: ${formatDateTime(tele.endedAt)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {tele.consentText && (
            <details className="no-print">
              <summary className="cursor-pointer text-marinho-700">Ver o termo aceito</summary>
              <p className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-600">{tele.consentText}</p>
            </details>
          )}
        </div>
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

  if (!showPanel) return <div className="mx-auto max-w-3xl">{main}</div>;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {main}
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
    </div>
  );
}