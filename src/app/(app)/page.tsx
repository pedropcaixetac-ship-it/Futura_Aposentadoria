import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { userTabs } from "@/lib/tabs";

// Início: leva à primeira aba liberada para a pessoa.
export default async function Home() {
  const user = await requireUser();
  const first = userTabs(user)[0];
  if (first) redirect(first.href);
  return (
    <div className="card max-w-lg">
      <h1 className="text-lg font-semibold">Nenhuma aba liberada</h1>
      <p className="mt-1 text-sm text-slate-500">Você ainda não tem acesso a nenhuma parte do sistema. Fale com o administrador da clínica.</p>
    </div>
  );
}
