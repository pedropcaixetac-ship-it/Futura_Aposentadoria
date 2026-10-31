import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { hasTab, TABS, tabInInstitution } from "@/lib/tabs";
import { resetPermissions, savePermissions } from "../../actions";
import { displayName, staffEditBlock } from "@/lib/staff";

export default async function PermissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("servidores");
  const { id } = await params;
  const staff = await prisma.user.findFirst({ where: { id, clinicId: user.clinicId }, omit: { passwordHash: true } });
  if (!staff) notFound();
  if (staffEditBlock(user, staff)) redirect("/servidores");
  const isAdmin = staff.role === "ADMIN";

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/servidores" className="text-sm text-marinho-700 hover:underline">← Cadastro de servidores</Link>
        <h1 className="text-2xl font-semibold">Permissões de {displayName(staff)}</h1>
        <p className="text-sm text-slate-500">
          Escolha as abas que aparecem para esta pessoa no menu. Perfil: {roleLabel[staff.role]}.{" "}
          {isAdmin
            ? "O gerente do sistema tem acesso a todas as abas."
            : staff.customTabs
              ? "As abas abaixo foram escolhidas à mão."
              : "Hoje valem as abas padrão do perfil."}
        </p>
      </div>

      <form action={savePermissions.bind(null, staff.id)} className="card space-y-4">
        <ul className="divide-y divide-slate-100">
          {TABS.filter((tab) => tabInInstitution(user.institution, tab.key)).map((tab) => {
            const blocked = tab.blockedReason?.(staff) ?? null;
            const checked = hasTab({ ...staff, institution: user.institution }, tab.key);
            return (
              <li key={tab.key} className="py-3">
                <label className={`flex items-start gap-3 ${blocked || isAdmin ? "cursor-not-allowed" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    name="tabs"
                    value={tab.key}
                    defaultChecked={checked}
                    disabled={!!blocked || isAdmin}
                    className="mt-1 h-4 w-4 accent-marinho-700"
                  />
                  <span>
                    <span className={`block font-medium ${blocked ? "text-slate-400" : "text-marinho-800"}`}>{tab.label}</span>
                    <span className="block text-sm text-slate-500">{tab.description}</span>
                    {blocked && <span className="block text-xs text-amber-700">{blocked}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-slate-500">
          Mesmo com a aba liberada, as regras de cada perfil continuam valendo: só profissionais de saúde veem o conteúdo clínico,
          e a Auditoria é só do gerente do sistema.
        </p>
        {!isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary">Salvar permissões</button>
            {staff.customTabs && (
              <button formAction={resetPermissions.bind(null, staff.id)} className="btn-secondary">
                Voltar ao padrão do perfil
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
