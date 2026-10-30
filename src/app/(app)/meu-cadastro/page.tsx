import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canViewClinical } from "@/lib/permissions";
import { age, formatCep, formatCpf, formatDate, formatDateTime, formatPhone, masks, roleLabel } from "@/lib/format";
import { displayName, ROLE_HELP, staffFunction, councilLabel } from "@/lib/staff";
import { hasTab, userTabs } from "@/lib/tabs";
import { availableProviders, isProviderId, providerLabel } from "@/lib/signature/providers";
import { ActionForm } from "../financeiro/action-form";
import { changeOwnPassword, endSession } from "./actions";

const sexLabel: Record<string, string> = { F: "Feminino", M: "Masculino", O: "Outro" };

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-6 space-y-4">
      <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">{title}</h2>
      {children}
    </section>
  );
}

function Info({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={value ? "text-sm text-slate-800" : "text-sm text-slate-400"}>{value || "Não informado"}</dd>
    </div>
  );
}

const grid = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

export default async function MyProfilePage() {
  const user = await requireUser();
  const me = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, omit: { passwordHash: true } });
  const canSign = hasTab(user, "assinatura");
  const providers = canSign ? availableProviders() : [];
  const sessions = canSign
    ? await prisma.signatureSession.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, select: { provider: true, expiresAt: true } })
    : [];
  const council = councilLabel(me);
  const address = [me.street, me.number, me.complement, me.district].filter(Boolean).join(", ");
  const cityState = [me.city, me.state].filter(Boolean).join(" / ");

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dourado-300 bg-marinho-50 text-xs text-slate-400">
          {/* eslint-disable-next-line @next/next/no-img-element -- foto guardada como data URL */}
          {me.photo ? <img src={me.photo} alt="Sua foto" className="h-full w-full object-cover" /> : "Sem foto"}
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Meu cadastro</h1>
          <p className="text-slate-600">{displayName(me)} · {staffFunction(me)}</p>
        </div>
      </div>

      <p className="rounded-md border border-marinho-100 bg-marinho-50 px-3 py-2 text-sm text-marinho-800">
        Estes são os seus dados no cadastro da clínica. Para corrigir alguma coisa, fale com o administrador da clínica.
        Aqui você só troca a sua senha{canSign && " e cuida do seu certificado digital"}.
      </p>

      <Section title="Identificação">
        <dl className={grid}>
          <Info label="Nome completo" value={me.name} wide />
          <Info label="Nome social" value={me.socialName} />
          <Info label="Data de nascimento" value={me.birthDate && `${formatDate(me.birthDate)} (${age(me.birthDate)} anos)`} />
          <Info label="Sexo" value={me.sex && sexLabel[me.sex]} />
          <Info label="CPF" value={formatCpf(me.cpf)} />
          <Info label="RG" value={me.rg} />
          <Info label="Cartão SUS (CNS)" value={me.cns && masks.cns(me.cns)} />
          <Info label="Estado civil" value={me.maritalStatus} />
          <Info label="Nome da mãe" value={me.motherName} wide />
        </dl>
      </Section>

      <Section title="Contato e endereço">
        <dl className={grid}>
          <Info label="Celular" value={formatPhone(me.phone)} />
          <Info label="Telefone fixo" value={formatPhone(me.landline)} />
          <Info label="E-mail" value={me.email} />
          <Info label="Contato de emergência" value={[me.emergencyContactName, formatPhone(me.emergencyContactPhone)].filter(Boolean).join(" · ")} />
          <Info label="Endereço" value={address} wide />
          <Info label="CEP" value={formatCep(me.cep)} />
          <Info label="Cidade / UF" value={cityState} />
        </dl>
      </Section>

      <Section title="Função na clínica">
        <dl className={grid}>
          <Info label="Função / cargo" value={me.jobTitle} />
          <Info label="Especialidade" value={me.specialty} />
          <Info label="Setor" value={me.sector} />
          <Info label="Registro no conselho" value={council} />
          <Info label="Perfil de acesso" value={roleLabel[me.role]} wide />
        </dl>
        <p className="text-sm text-slate-600">{ROLE_HELP[me.role]}</p>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Abas liberadas para você</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {userTabs(user).map((t) => (
              <li key={t.key} className="rounded-full bg-marinho-50 px-3 py-1 text-sm text-marinho-800">{t.label}</li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Trocar senha">
        <ActionForm action={changeOwnPassword} submitLabel="Trocar senha" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="current">Senha atual</label>
              <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
            </div>
            <div>
              <label className="label" htmlFor="password">Nova senha</label>
              <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
              <p className="mt-1 text-xs text-slate-500">Pelo menos 8 caracteres.</p>
            </div>
            <div>
              <label className="label" htmlFor="confirm">Repita a nova senha</label>
              <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
            </div>
          </div>
        </ActionForm>
      </Section>

      {canSign && (
        <Section title="Certificado digital" id="certificado">
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Atendimentos, receitas, atestados e pedidos podem ser assinados com o seu <strong>certificado digital em nuvem</strong>{" "}
              ICP-Brasil. A assinatura tem o mesmo valor de uma assinatura à mão.
            </p>
            <p>
              Médicos têm direito a um certificado gratuito do CFM (app <strong>VIDaaS</strong>). Outros profissionais podem usar o
              VIDaaS ou o <strong>BirdID</strong>. Na hora de assinar, você escolhe qual usar.
            </p>
            <p>
              Na primeira assinatura do dia, o sistema pede uma confirmação no app do certificado, no celular. Depois disso, você
              assina por 8 horas com um clique.
            </p>
            <p>
              O certificado precisa estar no seu CPF: <strong>{formatCpf(me.cpf) || "não informado"}</strong>.
              {!me.cpf && " Peça ao administrador para preencher o seu CPF no cadastro."}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Certificados disponíveis</p>
            {providers.length === 0 && <p className="text-sm text-slate-500">Nenhum certificado configurado ainda.</p>}
            <ul className="divide-y divide-slate-100">
              {providers.map((p) => {
                const session = sessions.find((s) => s.provider === p.id);
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{p.label}</p>
                      <p className={session ? "text-xs text-emerald-700" : "text-xs text-slate-500"}>
                        {session ? `Autorizado até ${formatDateTime(session.expiresAt)}` : "Sem autorização ativa"}
                      </p>
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
        </Section>
      )}
      {!canSign && canViewClinical(user) && (
        <p className="text-sm text-slate-500">A assinatura digital não está liberada para você. Fale com o administrador.</p>
      )}
    </div>
  );
}
