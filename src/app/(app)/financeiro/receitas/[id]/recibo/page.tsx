import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canManageCharges } from "@/lib/permissions";
import { formatCpf, formatDate } from "@/lib/format";
import { formatMoney, moneyInWords } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/finance";
import { PrintButton } from "@/app/(app)/pacientes/[id]/atendimentos/[encounterId]/print-button";

function formatCnpj(cnpj: string) {
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("financeiro");
  if (!canManageCharges(user)) notFound();
  const { id } = await params;
  const charge = await prisma.charge.findFirst({
    where: { id, clinicId: user.clinicId, status: "PAGO" },
    include: { patient: true, professional: true, clinic: true },
  });
  if (!charge || !charge.paidAt) notFound();

  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "RECIBO_EMITIDO",
    entity: "Charge",
    entityId: charge.id,
    patientId: charge.patientId,
  });

  const { clinic, patient, professional } = charge;
  const council = professional?.councilNumber ? `${professional.councilType} ${professional.councilNumber}/${professional.councilUf}` : null;
  const city = clinic.address?.split(/[-,]/).map((s) => s.trim()).filter(Boolean).at(-1);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href="/financeiro/receitas" className="text-sm text-marinho-700 hover:underline">← Voltar às receitas</Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Para PDF, escolha &quot;Salvar como PDF&quot; na impressão</span>
          <PrintButton />
        </div>
      </div>

      <div className="card space-y-6 p-8!">
        <div className="flex items-start justify-between gap-4 border-b-2 border-dourado-500 pb-4">
          <div>
            <p className="text-lg font-semibold text-marinho-900">{clinic.name}</p>
            <p className="text-xs text-slate-600">
              {[clinic.cnpj && `CNPJ ${formatCnpj(clinic.cnpj)}`, clinic.address, clinic.phone].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-slate-500">Recibo</p>
            <p className="font-mono text-lg font-semibold text-marinho-800">Nº {String(charge.receiptNumber).padStart(6, "0")}</p>
          </div>
        </div>

        <p className="text-right text-2xl font-semibold text-marinho-900">{formatMoney(charge.amountCents)}</p>

        <p className="leading-relaxed">
          Recebemos de <strong>{patient.name}</strong>
          {patient.cpf && <>, CPF {formatCpf(patient.cpf)}</>}, a importância de <strong>{formatMoney(charge.amountCents)}</strong> ({moneyInWords(charge.amountCents)}),
          referente a <strong>{charge.description}</strong>
          {professional && <>, realizado por {professional.name}{council && ` (${council})`}</>}, paga
          {charge.paymentMethod && <> via {paymentMethodLabel[charge.paymentMethod].toLowerCase()}</>} em {formatDate(charge.paidAt)}.
        </p>
        <p>Pelo que damos plena quitação.</p>

        <p className="text-right">{city ? `${city}, ` : ""}{charge.paidAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>

        <div className="mx-auto w-72 border-t border-slate-400 pt-1 text-center text-sm">
          <p>{professional?.name ?? clinic.name}</p>
          {council && <p className="text-xs text-slate-500">{council}</p>}
        </div>
      </div>
    </div>
  );
}
