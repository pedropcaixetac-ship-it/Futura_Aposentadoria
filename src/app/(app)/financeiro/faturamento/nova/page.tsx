import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { dateInput } from "@/lib/finance";
import { displayName } from "@/lib/staff";
import { defaultConsultationType, missingForClaim } from "@/lib/tiss";
import { createClaim } from "../actions";
import { ClaimForm } from "./claim-form";
import { SadtForm } from "./sadt-form";

// Data do atendimento no fuso de Brasília (aaaa-mm-dd).
function localDate(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export default async function NewClaimPage({ searchParams }: { searchParams: Promise<{ atendimento?: string; tipo?: string }> }) {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) notFound();
  const { atendimento, tipo } = await searchParams;
  const sadt = tipo === "sadt";
  const encounter = atendimento
    ? await prisma.encounter.findFirst({
        where: { id: atendimento, clinicId: user.clinicId, status: "FINALIZADO" },
        include: {
          patient: { include: { healthPlan: { include: { prices: { where: { active: true }, orderBy: { tussCode: "asc" } } } } } },
          professional: true,
          clinic: true,
          appointment: { select: { type: true } },
        },
      })
    : null;
  if (!encounter) notFound();
  const { patient, professional, clinic } = encounter;
  const plan = patient.healthPlan;

  // O CBO usado na última guia do profissional já vem preenchido.
  const lastClaim = await prisma.insuranceClaim.findFirst({
    where: { clinicId: user.clinicId, professionalId: professional.id },
    orderBy: { createdAt: "desc" },
    select: { cbo: true },
  });
  const missing = plan ? missingForClaim({ clinic, plan, professional }) : [];
  const prices = plan?.prices ?? [];
  const consulta = prices.find((p) => p.tussCode === "10101012") ?? prices[0];

  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/financeiro/faturamento" className="text-sm text-marinho-700 hover:underline">‹ Faturamento</Link>
      <div>
        <h2 className="text-lg font-semibold">{sadt ? "Nova guia SP/SADT (exames e procedimentos)" : "Nova guia de consulta"}</h2>
        <p className="text-sm text-slate-600">
          <span className="font-medium">{patient.name}</span> · {plan?.name ?? "sem convênio"} · {displayName(professional)} · {formatDateTime(encounter.finalizedAt)}
        </p>
      </div>

      {!plan ? (
        <p className="card text-sm text-red-700">O paciente não tem convênio cadastrado na ficha. Escolha o convênio na ficha do paciente e volte aqui.</p>
      ) : missing.length > 0 ? (
        <div className="card space-y-2 border-red-200 bg-red-50 text-sm text-red-800">
          <p className="font-medium">Antes de gerar a guia, complete o cadastro:</p>
          <ul className="list-disc pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      ) : prices.length === 0 ? (
        <p className="card text-sm text-red-700">
          O convênio {plan.name} ainda não tem procedimentos com preço. Cadastre em{" "}
          <Link href={`/financeiro/convenios/${plan.id}`} className="underline">Financeiro &gt; Convênios</Link>.
        </p>
      ) : sadt ? (
        <SadtForm
          action={createClaim.bind(null, encounter.id, "SPSADT")}
          prices={prices.map(({ tussCode, description, priceCents }) => ({ tussCode, description, priceCents }))}
          defaults={{
            cardNumber: patient.insuranceNumber ?? "",
            cardValidUntil: patient.insuranceValidUntil ? dateInput(patient.insuranceValidUntil) : "",
            serviceDate: localDate(encounter.finalizedAt ?? encounter.startedAt),
            cbo: lastClaim?.cbo ?? "",
          }}
        />
      ) : (
        <ClaimForm
          action={createClaim.bind(null, encounter.id, "CONSULTA")}
          prices={prices.map(({ tussCode, description, priceCents }) => ({ tussCode, description, priceCents }))}
          defaults={{
            cardNumber: patient.insuranceNumber ?? "",
            cardValidUntil: patient.insuranceValidUntil ? dateInput(patient.insuranceValidUntil) : "",
            serviceDate: localDate(encounter.finalizedAt ?? encounter.startedAt),
            consultationType: defaultConsultationType(encounter.appointment?.type),
            cbo: lastClaim?.cbo ?? "",
            tussCode: consulta?.tussCode ?? "",
          }}
        />
      )}
    </div>
  );
}
