import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canManageFinance } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { moneyInput } from "@/lib/money";
import { accidentIndications, claimNumberLabel, consultationTypes, councilCode, TUSS_TABLE, ufCode } from "@/lib/tiss";
import { PrintButton } from "@/app/(app)/pacientes/[id]/atendimentos/[encounterId]/print-button";
import { cancelClaim } from "../actions";

function Box({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-slate-400 px-2 py-1 ${className}`}>
      <p className="text-[10px] uppercase leading-tight text-slate-500">{label}</p>
      <p className="min-h-5 font-mono text-sm">{value}</p>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <p className="bg-marinho-800 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white print:bg-slate-200 print:text-black">{children}</p>;
}

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) notFound();
  const { id } = await params;
  const claim = await prisma.insuranceClaim.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { patient: true, professional: true, healthPlan: true, clinic: true },
  });
  if (!claim) notFound();
  await audit({ clinicId: user.clinicId, userId: user.id, action: "GUIA_IMPRESSA", entity: "InsuranceClaim", entityId: claim.id, patientId: claim.patientId });

  const { patient, professional, healthPlan: plan, clinic } = claim;
  const canceled = claim.status === "CANCELADA";
  const label = (list: readonly { value: number; label: string }[], value: number) => `${value} - ${list.find((i) => i.value === value)?.label ?? ""}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/financeiro/faturamento" className="text-sm text-marinho-700 hover:underline">‹ Faturamento</Link>
        <div className="flex items-center gap-3">
          {!canceled && (
            <form action={cancelClaim.bind(null, claim.id)}>
              <button className="btn-secondary text-red-700!">Cancelar guia</button>
            </form>
          )}
          <PrintButton />
        </div>
      </div>
      {canceled && <p className="no-print rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Guia cancelada em {formatDate(claim.canceledAt)}. Não envie ao convênio.</p>}

      <div className={`card space-y-2 p-4! ${canceled ? "opacity-60" : ""}`}>
        <div className="flex items-center justify-between border-b-2 border-dourado-500 pb-2">
          <p className="text-lg font-semibold text-marinho-900">GUIA DE CONSULTA</p>
          <p className="text-sm text-slate-600">{plan.name}</p>
        </div>
        <div className="grid grid-cols-3">
          <Box label="Registro ANS" value={plan.ansCode} />
          <Box label="Nº guia no prestador" value={claimNumberLabel(claim.number)} />
          <Box label="Nº guia atribuído pela operadora" value={claim.operatorNumber} />
        </div>

        <Title>Dados do beneficiário</Title>
        <div className="grid grid-cols-[2fr_1fr_1fr]">
          <Box label="Número da carteira" value={claim.cardNumber} />
          <Box label="Validade da carteira" value={formatDate(claim.cardValidUntil)} />
          <Box label="Atendimento a RN" value={claim.newborn ? "S" : "N"} />
        </div>
        <div className="grid grid-cols-[3fr_1fr]">
          <Box label="Nome" value={patient.name} />
          <Box label="Cartão Nacional de Saúde" value={patient.cns} />
        </div>

        <Title>Dados do contratado</Title>
        <div className="grid grid-cols-[1fr_3fr_1fr]">
          <Box label="Código na operadora / CNPJ" value={plan.providerCode ?? clinic.cnpj} />
          <Box label="Nome do contratado" value={clinic.name} />
          <Box label="Código CNES" value={clinic.cnes} />
        </div>
        <div className="grid grid-cols-[3fr_1fr_1fr_1fr_1fr]">
          <Box label="Nome do profissional executante" value={professional.name} />
          <Box label="Conselho profissional" value={`${councilCode(professional.councilType) ?? ""} - ${professional.councilType ?? ""}`} />
          <Box label="Número no conselho" value={professional.councilNumber} />
          <Box label="UF" value={`${ufCode(professional.councilUf) ?? ""} - ${professional.councilUf ?? ""}`} />
          <Box label="Código CBO" value={claim.cbo} />
        </div>

        <Title>Dados do atendimento / procedimento realizado</Title>
        <div className="grid grid-cols-3">
          <Box label="Indicação de acidente" value={label(accidentIndications, claim.accidentIndication)} />
          <Box label="Data do atendimento" value={formatDate(claim.serviceDate)} />
          <Box label="Tipo de consulta" value={label(consultationTypes, claim.consultationType)} />
        </div>
        <div className="grid grid-cols-[1fr_1fr_3fr_1fr]">
          <Box label="Código da tabela" value={TUSS_TABLE} />
          <Box label="Código do procedimento" value={claim.tussCode} />
          <Box label="Descrição" value={claim.description} />
          <Box label="Valor do procedimento (R$)" value={moneyInput(claim.amountCents)} />
        </div>
        <Box label="Observação / justificativa" value={claim.notes} />
        <div className="grid grid-cols-2 pt-6">
          <Box label="Assinatura do profissional executante" value={<span className="block h-10" />} />
          <Box label="Assinatura do beneficiário ou responsável" value={<span className="block h-10" />} />
        </div>
      </div>
    </div>
  );
}
