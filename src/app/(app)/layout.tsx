import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { userTabs } from "@/lib/tabs";
import { roleLabel } from "@/lib/format";
import { logout } from "../login/actions";
import { SidebarNav, type NavItem } from "./sidebar-nav";
import { SidebarShell } from "./sidebar-shell";
import { displayName } from "@/lib/staff";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Abas liberadas para a pessoa: padrão do perfil ou o que o administrador escolheu em "Editar permissões".
  // "Meu cadastro" aparece para todos, sem depender de permissão.
  const items: NavItem[] = [
    ...userTabs(user).filter((tab) => tab.menu !== false).map((tab) => ({ href: tab.href, label: tab.label })),
    { href: "/meu-cadastro", label: "Meu cadastro" },
  ];

  return (
    <div className="min-h-screen md:flex">
      <SidebarShell clinicName={user.clinic.name}>
        <div className="flex items-center gap-3 border-b border-marinho-800 pb-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-dourado-500 font-bold text-marinho-950">
            {initials(user.clinic.name)}
          </div>
          <span className="font-semibold leading-tight text-dourado-300">{user.clinic.name}</span>
        </div>

        <Link href="/meu-cadastro" className="block rounded-md bg-marinho-800/60 px-3 py-2 hover:bg-marinho-800">
          <p className="text-sm font-medium">{displayName(user)}</p>
          <p className="text-xs text-marinho-100">{user.sector ?? roleLabel[user.role]}</p>
        </Link>

        <div className="flex-1">
          <SidebarNav items={items} />
        </div>

        <form action={logout}>
          <button className="w-full rounded-md px-3 py-2 text-left text-sm text-marinho-100 hover:bg-marinho-800/60 hover:text-dourado-300">
            Sair
          </button>
        </form>
      </SidebarShell>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
