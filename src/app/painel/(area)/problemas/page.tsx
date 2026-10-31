import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePlatformUser } from "@/lib/painel-auth";
import { formatDateTime } from "@/lib/format";
import { problemKindLabel, type ProblemKind } from "@/lib/problems";
import { displayName } from "@/lib/staff";
import { setProblemResolved } from "./actions";

type Filters = { ver?: string; tipo?: string };

// Erros que aconteceram sozinhos no sistema e relatos do botão "Relatar problema", de todas as clínicas.
export default async function ProblemsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  await requirePlatformUser();
  const filters = await searchParams;
  const resolved = filters.ver === "resolvidos";
  const kind = filters.tipo === "ERRO" || filters.tipo === "RELATO" ? filters.tipo : undefined;
  const where: Prisma.ProblemReportWhereInput = { resolvedAt: resolved ? { not: null } : null, ...(kind && { kind }) };
  const problems = await prisma.problemReport.findMany({
    where,
    include: { clinic: { select: { id: true, name: true } }, user: true },
    orderBy: resolved ? { resolvedAt: "desc" } : { lastSeenAt: "desc" },
    take: 200,
  });

  const href = (change: Filters) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...change })) if (value) params.set(key, value);
    const qs = params.toString();
    return qs ? `/painel/problemas?${qs}` : "/painel/problemas";
  };
  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm ${active ? "bg-marinho-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-marinho-800">Problemas</h1>
        <p className="text-sm text-slate-500">
          Erros registrados automaticamente e relatos enviados pelas instituições. O mesmo erro repetido aparece uma vez só, com o número de vezes.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={href({ ver: undefined })} className={tab(!resolved)}>Abertos</Link>
        <Link href={href({ ver: "resolvidos" })} className={tab(resolved)}>Resolvidos</Link>
        <span className="mx-2 border-l border-slate-200" />
        <Link href={href({ tipo: undefined })} className={tab(!kind)}>Todos</Link>
        <Link href={href({ tipo: "RELATO" })} className={tab(kind === "RELATO")}>Relatos</Link>
        <Link href={href({ tipo: "ERRO" })} className={tab(kind === "ERRO")}>Erros automáticos</Link>
      </div>

      {problems.length === 0 && (
        <p className="card text-sm text-slate-500">{resolved ? "Nenhum problema resolvido ainda." : "Nenhum problema aberto. Tudo certo por aqui."}</p>
      )}

      <ul className="space-y-3">
        {problems.map((p) => (
          <li key={p.id} className="card space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className={`rounded px-2 py-0.5 font-medium ${p.kind === "RELATO" ? "bg-dourado-100 text-dourado-700" : "bg-red-50 text-red-700"}`}>
                {problemKindLabel[p.kind as ProblemKind] ?? p.kind}
              </span>
              <span>{formatDateTime(p.lastSeenAt)}</span>
              {p.count > 1 && <span>{p.count} vezes desde {formatDateTime(p.createdAt)}</span>}
              {p.clinic && <Link href={`/painel/clinicas/${p.clinic.id}`} className="text-marinho-700 hover:underline">{p.clinic.name}</Link>}
              {p.user && <span>{displayName(p.user)}</span>}
              {p.page && <span className="font-mono">{p.page}</span>}
              {p.digest && <span className="font-mono">código {p.digest}</span>}
            </div>
            <p className="whitespace-pre-wrap text-sm">{p.message}</p>
            {p.details && (
              <details className="text-xs">
                <summary className="cursor-pointer text-marinho-700">Detalhes técnicos</summary>
                <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-slate-600">{p.details}</pre>
              </details>
            )}
            <form action={setProblemResolved.bind(null, p.id, !resolved)}>
              <button className="btn-secondary">{resolved ? "Reabrir" : "Marcar como resolvido"}</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
