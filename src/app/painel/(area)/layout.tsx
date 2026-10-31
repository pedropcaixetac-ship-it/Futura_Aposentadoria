import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePlatformUser } from "@/lib/painel-auth";
import { platformLogout } from "../login/actions";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformUser();
  const openProblems = await prisma.problemReport.count({ where: { resolvedAt: null } });
  return (
    <div className="min-h-screen">
      <header className="bg-marinho-950 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-8">
          <Link href="/painel" className="font-semibold text-dourado-300">Painel do dono do sistema</Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-marinho-100">
            <Link href="/painel" className="hover:text-dourado-300">Clínicas</Link>
            <Link href="/painel/planos" className="hover:text-dourado-300">Planos</Link>
            <Link href="/painel/financeiro" className="hover:text-dourado-300">Financeiro</Link>
            <Link href="/painel/problemas" className="hover:text-dourado-300">
              Problemas
              {openProblems > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">{openProblems}</span>}
            </Link>
            <Link href="/painel/registro" className="hover:text-dourado-300">Registro de ações</Link>
            {user.owner && <Link href="/painel/equipe" className="hover:text-dourado-300">Equipe</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/painel/minha-conta" className="text-marinho-100 hover:text-dourado-300" title="Minha conta: senha e verificação em duas etapas">
              {user.name}
            </Link>
            <form action={platformLogout}>
              <button className="rounded-md px-2 py-1 text-marinho-100 hover:bg-marinho-800 hover:text-dourado-300">Sair</button>
            </form>
          </div>
        </div>
      </header>
      {!user.totpEnabledAt && (
        <div className="bg-amber-50 text-sm text-amber-800">
          <div className="mx-auto max-w-6xl px-4 py-2 md:px-8">
            Proteja o painel: ligue a verificação em duas etapas em{" "}
            <Link href="/painel/minha-conta" className="font-medium underline">Minha conta</Link>. Quem entra aqui controla todas as clínicas.
          </div>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
