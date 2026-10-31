import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { canWorkClinical } from "@/lib/permissions";
import { loadSpecialties } from "./data";

const LIMIT = 100;

// Pareceres esperando resposta: os da minha especialidade (ou pedidos a mim) primeiro; dá para ver os de outra especialidade.
export default async function ConsultsInboxPage({ searchParams }: { searchParams: Promise<{ especialidade?: string }> }) {
  const user = await requireUser("internacao");
  if (!canWorkClinical(user)) notFound();
  const { especialidade } = await searchParams;
  const specialties = await loadSpecialties(user.clinicId);
  const mine = user.specialty?.trim() || null;
  const chosen = especialidade === undefined ? mine : especialidade || null;
  const where: Prisma.ConsultRequestWhereInput = {
    clinicId: user.clinicId,
    status: "PENDENTE",
    ...(chosen
      ? { OR: [{ specialty: { equals: chosen, mode: "insensitive" } }, ...(chosen === mine ? [{ consultantId: user.id }] : [])] }
      : {}),
  };
  const [consults, total] = await Promise.all([
    prisma.consultRequest.findMany({
      where: { ...where, clinicId: user.clinicId },
      include: {
        patient: { select: { name: true, socialName: true } },
        admission: { select: { id: true, specialty: true, bed: { select: { code: true, ward: { select: { name: true } } } } } },
        requestedBy: { select: { name: true, sex: true, jobTitle: true } },
        consultant: { select: { name: true, sex: true, jobTitle: true } },
      },
      orderBy: [{ urgent: "desc" }, { createdAt: "asc" }],
      take: LIMIT,
    }),
    prisma.consultRequest.count({ where: { ...where, clinicId: user.clinicId } }),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/internacao" className="text-sm text-marinho-700 hover:underline">← Mapa de leitos</Link>
        <h1 className="text-2xl font-semibold">Pareceres esperando resposta</h1>
        <p className="text-sm text-slate-500">Urgentes primeiro, depois os mais antigos. Abra o paciente para responder e, se for o caso, assumir o caso.</p>
      </div>
      <form className="flex flex-wrap items-end gap-2" action="/internacao/pareceres">
        <div>
          <label className="label" htmlFor="especialidade">Especialidade</label>
          <select id="especialidade" name="especialidade" defaultValue={chosen ?? ""} className="input w-auto! min-w-56">
            <option value="">Todas</option>
            {specialties.map((s) => <option key={s} value={s}>{s}{s === mine ? " (a minha)" : ""}</option>)}
          </select>
        </div>
        <button className="btn-secondary">Filtrar</button>
      </form>
      <h2 className="font-semibold text-marinho-800">{chosen ? chosen : "Todas as especialidades"} ({total})</h2>
      {consults.length === 0 && <p className="card text-sm text-slate-500">Nenhum parecer esperando resposta.</p>}
      <ul className="space-y-2">
        {consults.map((c) => (
          <li key={c.id} className={`card space-y-1 text-sm ${c.urgent ? "border-red-300" : ""}`}>
            <p className="flex flex-wrap items-center gap-2">
              <Link href={`/internacao/${c.admission.id}/pareceres`} className="font-medium text-marinho-700 hover:underline">{c.patient.socialName || c.patient.name}</Link>
              <span className="text-slate-500">{c.admission.bed.ward.name} · leito {c.admission.bed.code}</span>
              {c.urgent && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">urgente</span>}
            </p>
            <p className="text-slate-600">
              {c.admission.specialty ?? "?"} pede parecer da <strong>{c.specialty}</strong>{c.consultant && ` (para ${displayName(c.consultant)})`} · {displayName(c.requestedBy)}, {formatDateTime(c.createdAt)}
            </p>
            <p className="whitespace-pre-line">{c.question}</p>
          </li>
        ))}
      </ul>
      {total > consults.length && <p className="text-xs text-slate-500">Mostrando os {consults.length} primeiros de {total}.</p>}
    </div>
  );
}
