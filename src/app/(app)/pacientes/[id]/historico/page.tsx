import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canViewClinical } from "@/lib/permissions";
import { age, formatCpf, formatDate, formatDateTime } from "@/lib/format";
import { filterEncounters, filtersQuery, FREE_TEMPLATE, hasFilters, parseHistoryFilters } from "@/lib/history";
import { EncounterContent } from "../encounter-content";
import { PrintButton } from "../atendimentos/[encounterId]/print-button";
import { displayName } from "@/lib/staff";

// Histórico completo (ou filtrado) pronto para imprimir ou salvar em PDF.
// Só entram atendimentos finalizados: rascunhos ainda podem mudar.
export default async function HistoryPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("pacientes");
  if (!canViewClinical(user)) notFound();
  const { id } = await params;
  const filters = parseHistoryFilters(await searchParams);

  const patient = await prisma.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!patient) notFound();

  const encounters = await prisma.encounter.findMany({
    where: { patientId: id, clinicId: user.clinicId, status: "FINALIZADO" },
    include: {
      professional: true,
      template: true,
      addenda: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { startedAt: "desc" },
  });
  const shown = filterEncounters(encounters, filters);

  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "HISTORICO_IMPRESSO",
    entity: "Patient",
    entityId: id,
    patientId: id,
    details: { ...filters, atendimentos: shown.length },
  });

  const chosen = encounters.find((e) => e.professionalId === filters.profissional)?.professional;
  const professionalName = chosen && displayName(chosen);
  const kindName = encounters.find((e) => (e.templateId ?? FREE_TEMPLATE) === filters.modelo)?.template?.name ?? "Evolução livre";
  const brDay = (d: string) => d.split("-").reverse().join("/");
  const description = [
    filters.de && filters.ate && `de ${brDay(filters.de)} até ${brDay(filters.ate)}`,
    filters.de && !filters.ate && `a partir de ${brDay(filters.de)}`,
    !filters.de && filters.ate && `até ${brDay(filters.ate)}`,
    filters.profissional && `profissional: ${professionalName ?? "—"}`,
    filters.modelo && `tipo: ${kindName}`,
    filters.cid && `CID: ${filters.cid}`,
    filters.palavra && `contendo "${filters.palavra}"`,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/pacientes/${id}${filtersQuery(filters)}`} className="text-sm text-marinho-700 hover:underline">← Voltar ao prontuário</Link>
        {shown.length > 0 && <PrintButton />}
      </div>

      <div className="card space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">{user.clinic.name} · Histórico de atendimentos</p>
        <h1 className="text-xl font-semibold">{patient.name}</h1>
        <p className="text-sm text-slate-600">
          {[
            patient.birthDate && `${age(patient.birthDate)} anos (${formatDate(patient.birthDate)})`,
            patient.cpf && `CPF ${formatCpf(patient.cpf)}`,
            patient.insurance,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {patient.allergies && <p className="text-sm font-semibold text-red-700">Alergias: {patient.allergies}</p>}
        <p className="text-sm text-slate-600">
          {hasFilters(filters) ? `Filtro: ${description.join("; ")}.` : "Todos os atendimentos finalizados."}{" "}
          {shown.length} atendimento{shown.length === 1 ? "" : "s"}.
        </p>
        <p className="text-xs text-slate-500">Emitido em {formatDateTime(new Date())} por {displayName(user)}.</p>
      </div>

      {shown.length === 0 && <p className="card text-sm text-slate-400">Nenhum atendimento finalizado encontrado.</p>}

      {shown.map((e) => (
        <article key={e.id} className="card break-inside-avoid-page space-y-3">
          <header className="border-b border-slate-100 pb-2">
            <p className="font-semibold">{formatDateTime(e.startedAt)} · {e.template?.name ?? "Evolução livre"}</p>
            <p className="text-sm text-slate-600">
              {displayName(e.professional)}
              {e.professional.councilNumber && ` · ${e.professional.councilType} ${e.professional.councilNumber}/${e.professional.councilUf}`}
            </p>
          </header>
          <EncounterContent encounter={e} />
          <p className="text-xs text-slate-500">
            Finalizado em {formatDateTime(e.finalizedAt)} · Código de integridade: <span className="font-mono">{e.contentHash?.slice(0, 16)}</span>
          </p>
        </article>
      ))}
    </div>
  );
}
