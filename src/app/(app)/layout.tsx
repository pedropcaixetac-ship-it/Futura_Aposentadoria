import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { userTabs } from "@/lib/tabs";
import { roleLabel } from "@/lib/format";
import { logout } from "../login/actions";
import { SidebarNav, type NavItem } from "./sidebar-nav";
import { SidebarShell } from "./sidebar-shell";
import { ReportLink } from "./report-link";
import { displayName } from "@/lib/staff";
import { billingStatus } from "@/lib/plans";
import { formatDate } from "@/lib/format";

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
  // Aviso da mensalidade do sistema, só para o gerente do sistema da clínica.
  const billing = user.role === "ADMIN" ? billingStatus(user.clinic.paidUntil) : null;
  const billingNotice =
    billing?.kind === "vence-logo"
      ? `A mensalidade do sistema vence ${billing.daysLeft === 0 ? "hoje" : `em ${formatDate(user.clinic.paidUntil)}`}. Fale com o suporte se precisar do boleto ou do Pix.`
      : billing?.kind === "atrasada"
        ? `A mensalidade do sistema está atrasada há ${billing.daysLate} dia(s). O acesso da clínica será suspenso em ${billing.daysToBlock} dia(s) se o pagamento não for registrado.`
        : null;

  // Abas liberadas para a pessoa: padrão do perfil ou o que o administrador escolheu em "Editar permissões".
  // "Meu cadastro" aparece para todos, sem depender de permissão.
  const items: NavItem[] = [
    ...userTabs(user).filter((tab) => tab.menu !== false).map((tab) => ({
      href: tab.href,
      label: tab.label,
      // A tela do atendimento fica dentro de Pacientes, mas para quem atende ela pertence à aba Atender.
      ...(tab.key === "atender" && { alsoActive: "^/pacientes/[^/]+/atendimentos/" }),
    })),
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

        <ReportLink />
        <form action={logout}>
          <button className="w-full rounded-md px-3 py-2 text-left text-sm text-marinho-100 hover:bg-marinho-800/60 hover:text-dourado-300">
            Sair
          </button>
        </form>
      </SidebarShell>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto max-w-6xl">
          {billingNotice && (
            <p className={`no-print mb-4 rounded-md px-3 py-2 text-sm ${billing?.kind === "atrasada" ? "bg-red-50 text-red-700" : "bg-dourado-100 text-dourado-700"}`}>
              {billingNotice}
            </p>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
