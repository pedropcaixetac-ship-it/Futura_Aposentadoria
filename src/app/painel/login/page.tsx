import { redirect } from "next/navigation";
import { getPlatformUser } from "@/lib/painel-auth";
import { PlatformLoginForm } from "./login-form";

export default async function PlatformLoginPage() {
  if (await getPlatformUser()) redirect("/painel");
  return (
    <main className="flex min-h-screen items-center justify-center bg-marinho-950 p-4">
      <div className="card w-full max-w-sm border-t-4 border-t-dourado-500">
        <h1 className="text-xl font-semibold text-marinho-800">Painel do dono do sistema</h1>
        <p className="mb-6 text-sm text-slate-500">Acesso só da equipe da empresa. Instituições entram pela tela normal de login.</p>
        <PlatformLoginForm />
      </div>
    </main>
  );
}
