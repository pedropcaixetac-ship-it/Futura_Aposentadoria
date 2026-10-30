import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canManageCharges, canViewClinical } from "@/lib/permissions";
import { age, formatCpf, formatDate, formatDateTime, formatPhone } from "@/lib/format";
import { whatsappNumber } from "@/lib/whatsapp";
import type { Diagnosis, TemplateField } from "@/lib/record";
import { updateClinicalSummary } from "../actions";
import { startEncounter } from "./actions";
import { ClinicalSummary } from "./clinical-summary";
import { PatientDetails } from "./patient-details";
import { WhatsappButton } from "./whatsapp-button";

export default async function PatientRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const patient = await prisma.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!patient) notFound();

  const clinical = canViewClinical(user);
  const canWhatsapp = patient.whatsappOptIn && patient.phoneWhatsapp && !!whatsappNumber(patient.phone);
  const [encounters, templates] = clinical
    ? await Promise.all([
        prisma.encounter.findMany({
          where: { patientId: id, clinicId: user.clinicId },
          include: { professional: true, template: true, _count: { select: { addenda: true } } },
          orderBy: { startedAt: "desc" },
        }),
        prisma.recordTemplate.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } }),
      ])
    : [[], []];

  if (clinical) {
    await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_VISUALIZADO", entity: "Patient", entityId: id, patientId: id });
  }

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
            action={updateClinicalSummary.bind(null, id)} />

          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Atendimentos</h2>
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

            {encounters.length === 0 && <p className="text-sm text-slate-400">Nenhum atendimento registrado.</p>}

            <ol className="space-y-3">
              {encounters.map((e) => {
                const fields = e.fields as TemplateField[];
                const content = e.content as Record<string, string>;
                const diagnoses = e.diagnoses as Diagnosis[];
                const preview = fields.map((f) => content[f.key]).find(Boolean);
                return (
                  <li key={e.id}>
                    <Link
                      href={`/pacientes/${id}/atendimentos/${e.id}`}
                      className="block rounded-md border border-slate-200 p-4 hover:border-marinho-400 hover:bg-marinho-50/30"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{formatDateTime(e.startedAt)}</span>
                        <span className="text-slate-500">· {e.template?.name ?? "Evolução livre"} · {e.professional.name}</span>
                        {e.status === "RASCUNHO" ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Rascunho</span>
                        ) : (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Finalizado</span>
                        )}
                        {e._count.addenda > 0 && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {e._count.addenda} adendo{e._count.addenda > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {diagnoses.length > 0 && (
                        <p className="mt-1 text-sm text-slate-600">
                          {diagnoses.map((d) => `${d.code} ${d.description}`).join("; ")}
                        </p>
                      )}
                      {preview && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{preview}</p>}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
