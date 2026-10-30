import { requireUser } from "@/lib/auth";
import { canManageTemplates, canUseReception, canViewAudit, canViewClinical } from "@/lib/permissions";
import { roleLabel } from "@/lib/format";
import { logout } from "../login/actions";
import { SidebarNav, type NavItem } from "./sidebar-nav";
import { SidebarShell } from "./sidebar-shell";

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
  const clinical = canViewClinical(user);

  // Itens "em breve" são os próximos módulos do plano.
  const items: NavItem[] = [
    ...(canUseReception(user) ? [{ href: "/recepcao", label: "Recepção" }] : []),
    { href: "/agenda", label: "Agenda" },
    { href: "/pacientes", label: "Pacientes" },
    ...(canManageTemplates(user) ? [{ href: "/modelos", label: "Modelos de atendimento" }] : []),
    ...(clinical ? [{ href: "/textos-prontos", label: "Meus textos prontos" }] : []),
    ...(clinical ? [{ href: "/assinatura", label: "Assinatura digital" }] : []),
    { href: "/financeiro", label: "Financeiro" },
    ...(canViewAudit(user) ? [{ href: "/auditoria", label: "Auditoria" }] : []),
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

        <div className="rounded-md bg-marinho-800/60 px-3 py-2">
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-marinho-100">{user.sector ?? roleLabel[user.role]}</p>
        </div>

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
