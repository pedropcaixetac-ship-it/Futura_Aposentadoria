import { redirect } from "next/navigation";
import { requirePlatformUser } from "@/lib/painel-auth";
import { ActionForm } from "@/app/(app)/financeiro/action-form";
import { PasswordFields } from "@/app/(app)/meu-cadastro/password-fields";
import { changePlatformPassword } from "../(area)/minha-conta/actions";
import { platformLogout } from "../login/actions";

// Senha provisória (criada pelo dono) ou que não segue as regras: cria a própria antes de usar o painel.
export default async function PlatformNewPasswordPage() {
  const user = await requirePlatformUser({ passwordChange: true });
  if (!user.mustChangePassword) redirect("/painel");
  return (
    <main className="flex min-h-screen items-center justify-center bg-marinho-950 p-4">
      <div className="card w-full max-w-2xl space-y-4 border-t-4 border-t-dourado-500">
        <div>
          <h1 className="text-xl font-semibold text-marinho-800">Crie a sua senha</h1>
          <p className="text-sm text-slate-600">
            Olá, {user.name}. Antes de usar o painel, troque a senha provisória por uma só sua.
          </p>
        </div>
        <ActionForm action={changePlatformPassword} submitLabel="Salvar e entrar" className="space-y-4">
          <PasswordFields currentLabel="Senha que você usou para entrar" />
        </ActionForm>
        <form action={platformLogout}><button className="text-sm text-marinho-700 hover:underline">Sair</button></form>
      </div>
    </main>
  );
}
