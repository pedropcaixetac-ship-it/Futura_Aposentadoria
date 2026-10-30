import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageCharges } from "@/lib/permissions";
import { formatCpf, formatDate, formatDateTime } from "@/lib/format";
import { dateInput, paymentMethodLabel, paymentMethods, today } from "@/lib/finance";
import { ChargeForm } from "./charge-form";

export default async function NewChargePage({ searchParams }: {
  searchParams: Promise<{ atendimento?: string; paciente?: string; q?: string }>;
}) {
  const user = await requireUser("financeiro");
  if (!canManageCharges(user)) notFound();
  const { atendimento, paciente, q = "" } = await searchParams;
  const clinicId = user.clinicId;

  const encounter = atendimento
    ? await prisma.encounter.findFirst({
        where: { id: atendimento, clinicId, status: "FINALIZADO" },
        select: { id: true, finalizedAt: true, patientId: true, professional: { select: { id: true, name: true } } },
      })
    : null;
  const patientId = encounter?.patientId ?? paciente;
  const patient = patientId ? await prisma.patient.findFirst({ where: { id: patientId, clinicId } }) : null;

  // Sem paciente escolhido, mostra a busca.
  if (!patient) {
    const term = q.trim();
    const digits = term.replace(/\D/g, "");
    const results = term
      ? await prisma.patient.findMany({
          where: {
            clinicId,
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              ...(digits ? [{ cpf: { contains: digits } }, { phone: { contains: digits } }] : []),
            ],
          },
          orderBy: { name: "asc" },
          take: 20,
        })
      : [];
    return (
      <div className="max-w-3xl space-y-4">
        <h2 className="text-lg font-semibold">Nova cobrança: escolha o paciente</h2>
        <form className="flex gap-2">
          <input name="q" defaultValue={term} placeholder="Buscar por nome, CPF ou telefone" className="input max-w-md" autoFocus />
          <button className="btn-secondary">Buscar</button>
        </form>
        {term && (
          <ul className="card divide-y divide-slate-100 p-0 text-sm">
            {results.map((p) => (
              <li key={p.id}>
                <Link href={`/financeiro/receitas/nova?paciente=${p.id}`} className="flex justify-between gap-2 px-4 py-2 hover:bg-marinho-50/40">
                  <span className="font-medium text-marinho-800">{p.name}</span>
                  <span className="text-slate-500">{[formatCpf(p.cpf), formatDate(p.birthDate)].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
            {results.length === 0 && <li className="px-4 py-6 text-center text-slate-400">Nenhum paciente encontrado.</li>}
          </ul>
        )}
      </div>
    );
  }

  const [priceItems, professionals] = await Promise.all([
    prisma.priceItem.findMany({ where: { clinicId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, priceCents: true } }),
    encounter
      ? null
      : prisma.user.findMany({ where: { clinicId, active: true, councilNumber: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="card">
        <p className="text-xs uppercase tracking-wide text-slate-500">Nova cobrança</p>
        <h2 className="text-lg font-semibold">{patient.name}</h2>
        <p className="text-sm text-slate-600">
          {[patient.cpf && `CPF ${formatCpf(patient.cpf)}`, patient.insurance].filter(Boolean).join(" · ")}
        </p>
        {encounter && (
          <p className="mt-1 text-sm text-slate-600">
            Atendimento de {formatDateTime(encounter.finalizedAt)} com {encounter.professional.name}
          </p>
        )}
      </div>
      <ChargeForm
        patientId={patient.id}
        encounterId={encounter?.id}
        professionals={professionals}
        priceItems={priceItems}
        paymentMethods={paymentMethods.map((m) => ({ value: m, label: paymentMethodLabel[m] }))}
        today={dateInput(today())}
      />
    </div>
  );
}
