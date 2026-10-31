import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { availableProviders } from "@/lib/signature/providers";
import { pendingHospitalRecords, recordTypeLabel } from "@/lib/signature/hospital";
import { hospitalTarget } from "@/lib/signature/service";
import { SignAllBox, SignBox } from "../../pacientes/[id]/atendimentos/[encounterId]/sign-box";

const BACK = "/assinatura/pendentes";

// Tudo o que o profissional registrou no hospital nos últimos 30 dias e ainda não assinou com o certificado.
export default async function PendingSignaturesPage() {
  const user = await requireUser("assinatura");
  const [pending, providers] = await Promise.all([pendingHospitalRecords(user), Promise.resolve(availableProviders())]);
  const byDay = new Map<string, typeof pending>();
  for (const r of pending) {
    const d = formatDate(r.when);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Assinaturas pendentes</h1>
          <p className="text-sm text-slate-500">
            Prescrições, registros de enfermagem, triagens, altas, cirurgias, resultados de exame, quimioterapia e pareceres feitos por você nos últimos 30 dias que
            ainda não foram assinados com o certificado digital (ICP-Brasil). Evoluções e atendimentos são assinados na tela de cada um.
          </p>
        </div>
        <SignAllBox targets={pending.map((r) => hospitalTarget(r.type, r.key))} providers={providers} back={BACK} />
      </div>

      {providers.length === 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Nenhum certificado configurado ainda. Veja em <Link href="/meu-cadastro#certificado" className="underline">Meu cadastro</Link>.
        </p>
      )}

      {pending.length === 0 ? (
        <p className="card text-sm text-slate-600">Tudo assinado. ✓</p>
      ) : (
        [...byDay].map(([d, list]) => (
          <section key={d} className="card space-y-2">
            <h2 className="font-semibold text-marinho-800">{d}</h2>
            <ul className="divide-y divide-slate-100">
              {list.map((r) => (
                <li key={`${r.type}|${r.key}`} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <span className="mr-2 rounded bg-marinho-50 px-1.5 py-0.5 text-xs text-marinho-800">{recordTypeLabel[r.type]}</span>
                    <strong>{r.patientName}</strong> · {r.label}
                    <Link href={r.href} className="ml-2 text-marinho-700 hover:underline">abrir</Link>
                  </div>
                  <SignBox target={hospitalTarget(r.type, r.key)} signed={null} canSign providers={providers} back={BACK} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
