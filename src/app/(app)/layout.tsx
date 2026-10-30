import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canManageTemplates, canViewAudit } from "@/lib/permissions";
import { roleLabel } from "@/lib/format";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/pacientes" className="font-semibold text-teal-800">{user.clinic.name}</Link>
          <nav className="flex gap-4 text-sm text-slate-600">
            <Link href="/pacientes" className="hover:text-teal-700">Pacientes</Link>
            {canManageTemplates(user) && <Link href="/modelos" className="hover:text-teal-700">Modelos de atendimento</Link>}
            {canViewAudit(user) && <Link href="/auditoria" className="hover:text-teal-700">Auditoria</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {user.name} <span className="text-slate-400">· {roleLabel[user.role]}</span>
            </span>
            <form action={logout}>
              <button className="text-slate-500 hover:text-red-600">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
