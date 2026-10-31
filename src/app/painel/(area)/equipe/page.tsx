import { prisma } from "@/lib/db";
import { requirePlatformUser } from "@/lib/painel-auth";
import { formatDateTime } from "@/lib/format";
import { ActionForm } from "@/app/(app)/financeiro/action-form";
import { createTeamMember, resetTeamMemberPassword, resetTeamMemberTwoFactor, setTeamMemberActive, setTeamMemberOwner } from "./actions";

// Quem da empresa entra no painel. Só o dono mexe aqui.
export default async function PlatformTeamPage() {
  const me = await requirePlatformUser({ owner: true });
  const team = await prisma.platformUser.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-marinho-800">Equipe do painel</h1>
        <p className="text-sm text-slate-600">
          Pessoas da empresa que entram neste painel. A equipe cuida das instituições, planos e problemas; só quem é dono
          cadastra e bloqueia pessoas aqui. Ninguém da equipe vê dados de pacientes.
        </p>
      </div>

      <div className="space-y-3">
        {team.map((p) => {
          const self = p.id === me.id;
          return (
            <section key={p.id} className={`card space-y-3 ${p.active ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-marinho-800">
                    {p.name} {self && <span className="text-xs font-normal text-slate-500">(você)</span>}
                  </h2>
                  <p className="text-sm text-slate-600">{p.email}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 ${p.owner ? "bg-dourado-100 text-dourado-700" : "bg-marinho-50 text-marinho-700"}`}>
                    {p.owner ? "Dono" : "Equipe"}
                  </span>
                  {!p.active && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">Bloqueado</span>}
                  {p.mustChangePassword && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Senha provisória</span>}
                  <span className={`rounded-full px-2 py-0.5 ${p.totpEnabledAt ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {p.totpEnabledAt ? "Duas etapas ligada" : "Sem duas etapas"}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Cadastro em {formatDateTime(p.createdAt)} · {p.lastLoginAt ? `último acesso ${formatDateTime(p.lastLoginAt)}` : "ainda não entrou"}
              </p>
              {!self && (
                <div className="flex flex-wrap items-start gap-3 border-t border-slate-100 pt-3 text-sm">
                  <form action={setTeamMemberActive.bind(null, p.id, !p.active)}>
                    <button className={p.active ? "btn-secondary text-red-700" : "btn-secondary"}>{p.active ? "Bloquear acesso" : "Reativar acesso"}</button>
                  </form>
                  <form action={setTeamMemberOwner.bind(null, p.id, !p.owner)}>
                    <button className="btn-secondary">{p.owner ? "Tirar papel de dono" : "Tornar dono"}</button>
                  </form>
                  {p.totpEnabledAt && (
                    <form action={resetTeamMemberTwoFactor.bind(null, p.id)}>
                      <button className="btn-secondary">Desligar duas etapas (perdeu o celular)</button>
                    </form>
                  )}
                  <ActionForm action={resetTeamMemberPassword.bind(null, p.id)} submitLabel="Gerar senha provisória" resetOnSuccess={false} className="space-y-2">
                    {null}
                  </ActionForm>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <section className="card space-y-3">
        <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">Cadastrar pessoa na equipe</h2>
        <p className="text-sm text-slate-600">
          O painel gera uma senha provisória para você passar à pessoa. No primeiro acesso ela é obrigada a criar a própria senha.
        </p>
        <ActionForm action={createTeamMember} submitLabel="Cadastrar" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Nome</label>
              <input className="input" id="name" name="name" required />
            </div>
            <div>
              <label className="label" htmlFor="email">E-mail</label>
              <input className="input" id="email" name="email" type="email" required autoCapitalize="none" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="owner" />
            Também é dono (pode cadastrar e bloquear pessoas da equipe)
          </label>
        </ActionForm>
      </section>
    </div>
  );
}
