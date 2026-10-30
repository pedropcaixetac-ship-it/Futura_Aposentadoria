import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ActionForm } from "../(app)/financeiro/action-form";
import { changeOwnPassword } from "../(app)/meu-cadastro/actions";
import { PasswordFields } from "../(app)/meu-cadastro/password-fields";

// Primeiro acesso (ou senha trocada pelo gerente): a pessoa cria a própria senha antes de usar o sistema.
export default async function NewPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-marinho-900 p-4">
      <div className="card w-full max-w-3xl space-y-4 border-t-4 border-t-dourado-500">
        <div>
          <h1 className="text-xl font-semibold text-marinho-800">Crie a sua senha</h1>
          <p className="text-sm text-slate-500">
            A senha que você usou foi criada pela administração. Para ninguém mais conhecê-la, crie agora uma senha só sua.
          </p>
        </div>
        <ActionForm action={changeOwnPassword} submitLabel="Salvar senha e entrar" className="space-y-4">
          <PasswordFields currentLabel="Senha que você recebeu" />
        </ActionForm>
      </div>
    </main>
  );
}
