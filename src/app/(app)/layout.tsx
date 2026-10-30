import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canManageTemplates, canViewAudit } from "@/lib/permissions";
import { roleLabel } from "@/lib/format";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="no-print border-b-2 border-dourado-500 bg-marinho-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/pacientes" className="font-semibold text-dourado-400">{user.clinic.name}</Link>
          <nav className="flex gap-4 text-sm text-marinho-100">
            <Link href="/pacientes" className="hover:text-dourado-300">Pacientes</Link>
            {canManageTemplates(user) && <Link href="/modelos" className="hover:text-dourado-300">Modelos de atendimento</Link>}
            {canViewAudit(user) && <Link href="/auditoria" className="hover:text-dourado-300">Auditoria</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-marinho-100">
              {user.name} <span className="text-marinho-400">· {roleLabel[user.role]}</span>
            </span>
            <form action={logout}>
              <button className="text-marinho-100 hover:text-dourado-300">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
