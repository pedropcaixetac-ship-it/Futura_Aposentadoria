import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canViewClinical } from "@/lib/permissions";
import { allLaudoDefaults, LAUDO_TYPES } from "@/lib/laudos";
import { issueLaudo } from "../../actions";
import { DocumentForm } from "../../atendimentos/[encounterId]/document-form";

// APAC, AIH ou LME emitidos direto pela ficha do paciente, sem abrir um atendimento.
export default async function NewLaudoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("pacientes");
  if (!canViewClinical(user)) notFound();
  const { id } = await params;
  const patient = await prisma.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!patient) notFound();

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href={`/pacientes/${id}`} className="text-sm text-marinho-700 hover:underline">← {patient.socialName || patient.name}</Link>
        <h1 className="text-2xl font-semibold">Laudo do SUS</h1>
        <p className="text-sm text-slate-600">
          Escolha APAC, AIH ou LME. Os dados do paciente, da clínica e os seus já vêm preenchidos: confira e complete o resto.
          O PDF sai no formulário oficial, pronto para imprimir e assinar.
        </p>
      </div>
      <div className="card">
        <DocumentForm issue={issueLaudo.bind(null, id)} types={LAUDO_TYPES} laudoDefaults={allLaudoDefaults({ clinic: user.clinic, patient, professional: user })} />
      </div>
    </div>
  );
}
