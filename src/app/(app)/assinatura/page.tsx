import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canViewClinical } from "@/lib/permissions";
import { formatCpf, formatDateTime } from "@/lib/format";
import { availableProviders, providerLabel, isProviderId } from "@/lib/signature/providers";
import { endSession, saveCpf } from "./actions";

export default async function SignatureSettingsPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await requireUser("assinatura");
  if (!canViewClinical(user)) notFound();
  const { erro } = await searchParams;

  const providers = availableProviders();
  const sessions = await prisma.signatureSession.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    select: { provider: true, expiresAt: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Assinatura digital</h1>

      <div className="card space-y-2 text-sm text-slate-700">
        <p>
          Atendimentos, receitas, atestados e pedidos podem ser assinados com o seu <strong>certificado digital em nuvem</strong>{" "}
          ICP-Brasil. A assinatura tem o mesmo valor de uma assinatura à mão.
        </p>
        <p>
          Médicos têm direito a um certificado gratuito do CFM (app <strong>VIDaaS</strong>). Outros profissionais podem usar o
          VIDaaS ou o <strong>BirdID</strong>.
        </p>
        <p>
          Na primeira assinatura do dia, o sistema pede uma confirmação no app do certificado, no celular. Depois disso, você
          assina por 8 horas com um clique.
        </p>
      </div>

      <form action={saveCpf} className="card space-y-2">
        <label className="label" htmlFor="cpf">Seu CPF (o mesmo do certificado)</label>
        <div className="flex gap-2">
          <input className="input max-w-xs" id="cpf" name="cpf" defaultValue={formatCpf(user.cpf)} placeholder="000.000.000-00" />
          <button className="btn-secondary">Salvar</button>
        </div>
        {erro === "cpf" && <p className="text-sm text-red-700">CPF inválido.</p>}
        {erro === "cpf-em-uso" && <p className="text-sm text-red-700">Este CPF já está cadastrado para outra pessoa da clínica.</p>}
      </form>

      <div className="card space-y-3">
        <h2 className="font-semibold">Provedores disponíveis</h2>
        {providers.length === 0 && <p className="text-sm text-slate-500">Nenhum provedor configurado ainda.</p>}
        <ul className="divide-y divide-slate-100">
          {providers.map((p) => {
            const session = sessions.find((s) => s.provider === p.id);
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{p.label}</p>
                  {session && (
                    <p className="text-xs text-emerald-700">Autorizado até {formatDateTime(session.expiresAt)}</p>
                  )}
                </div>
                {session && isProviderId(session.provider) && (
                  <form action={endSession.bind(null, session.provider)}>
                    <button className="btn-secondary">Encerrar autorização de {providerLabel[session.provider]}</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
