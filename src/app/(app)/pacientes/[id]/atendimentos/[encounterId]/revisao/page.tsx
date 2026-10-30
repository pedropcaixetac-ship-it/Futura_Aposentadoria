import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canEditEncounter, canViewClinical, canWorkClinical } from "@/lib/permissions";
import { displayName } from "@/lib/staff";
import { age, formatDate, formatDateTime } from "@/lib/format";
import { documentTypeLabel } from "@/lib/documents";
import type { Diagnosis, TemplateField } from "@/lib/record";
import type { Vitals } from "@/lib/vitals";
import { availableProviders } from "@/lib/signature/providers";
import { finalizeEncounter } from "../../../actions";
import { SignAllBox, SignBox } from "../sign-box";
import { VitalsView } from "../vitals-view";
import { FinalizeButton } from "./finalize-button";

// Segunda etapa da consulta: o profissional confere o resumo, assina os
// documentos e só então finaliza o atendimento.
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; encounterId: string }>;
  searchParams: Promise<{ assinatura?: string }>;
}) {
  const user = await requireUser("pacientes");
  const { id, encounterId } = await params;
  const { assinatura } = await searchParams;
  if (!canWorkClinical(user)) notFound();
  // Acesso restrito finaliza o próprio atendimento, mas não emite documentos.
  const full = canViewClinical(user);

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, patientId: id, clinicId: user.clinicId },
    include: {
      patient: true,
      professional: true,
      documents: {
        where: { authorId: user.id },
        include: { signedPdf: { select: { id: true, signerName: true, signedAt: true, provider: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!encounter) notFound();
  const editHref = `/pacientes/${id}/atendimentos/${encounter.id}`;
  if (!canEditEncounter(user, encounter)) redirect(editHref);

  const back = `${editHref}/revisao`;
  const providers = availableProviders();
  const fields = encounter.fields as TemplateField[];
  const content = encounter.content as Record<string, string>;
  const diagnoses = encounter.diagnoses as Diagnosis[];
  const filled = fields.filter((f) => content[f.key]?.trim());
  const unsigned = encounter.documents.filter((d) => !d.signedPdf).map((d) => ({ kind: "documento" as const, id: d.id }));
  const { patient } = encounter;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={editHref} className="text-sm text-marinho-700 hover:underline">← Voltar e editar</Link>

      <div className="rounded-lg bg-marinho-900 px-4 py-3 text-white shadow-md">
        <p className="text-xs uppercase tracking-wide text-dourado-300">Revisão do atendimento</p>
        <p className="text-lg font-semibold">
          {patient.socialName || patient.name}
          {patient.birthDate && <span className="font-normal text-marinho-100"> · {age(patient.birthDate)} anos ({formatDate(patient.birthDate)})</span>}
        </p>
        <p className="text-sm text-marinho-100">{formatDateTime(encounter.startedAt)} · {displayName(encounter.professional)}</p>
      </div>

      {assinatura === "erro" && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Não foi possível assinar. Confira se o seu CPF está certo em Assinatura digital e tente de novo.
        </p>
      )}
      {assinatura === "cancelada" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          A assinatura foi cancelada no app do certificado.
        </p>
      )}

      <div className="card space-y-4">
        <h2 className="font-semibold">Resumo do atendimento</h2>
        <VitalsView vitals={encounter.vitals as Vitals | null} />
        {filled.map((f) => (
          <section key={f.key}>
            <h3 className="text-sm font-semibold text-slate-700">{f.label}</h3>
            <p className="whitespace-pre-wrap text-sm">{content[f.key]}</p>
          </section>
        ))}
        {diagnoses.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-slate-700">Diagnósticos (CID-10)</h3>
            <ul className="text-sm">
              {diagnoses.map((d) => (
                <li key={d.code}><strong>{d.code}</strong> {d.description}</li>
              ))}
            </ul>
          </section>
        )}
        {filled.length === 0 && diagnoses.length === 0 && !encounter.vitals && (
          <p className="text-sm text-amber-800">Nada foi preenchido neste atendimento. Volte e preencha antes de finalizar.</p>
        )}
      </div>

      {full && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Documentos emitidos</h2>
          {encounter.documents.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhuma receita, atestado ou pedido neste atendimento. Para emitir, use{" "}
              <Link href={editHref} className="text-marinho-700 hover:underline">Voltar e editar</Link>.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {encounter.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {documentTypeLabel[d.type]}
                        <span className="font-normal text-slate-500"> · {formatDateTime(d.createdAt)}</span>
                      </p>
                      <p className="truncate text-sm text-slate-600">{d.body.split("\n").find((l) => l.trim())}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <SignBox target={{ kind: "documento", id: d.id }} signed={d.signedPdf} canSign providers={providers} back={back} />
                      <a href={`/api/pdf/documento/${d.id}`} target="_blank" className="btn-secondary">PDF</a>
                    </div>
                  </li>
                ))}
              </ul>
              {unsigned.length > 0 ? (
                <div className="border-t border-slate-100 pt-3">
                  <SignAllBox targets={unsigned} providers={providers} back={back} />
                </div>
              ) : (
                <p className="border-t border-slate-100 pt-3 text-right text-sm text-emerald-700">✓ Todos os documentos estão assinados.</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Depois de finalizar, o atendimento não pode mais ser alterado, só complementado por adendo.
        </p>
        <FinalizeButton finalize={finalizeEncounter.bind(null, encounter.id)} />
      </div>
    </div>
  );
}
