import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/pacientes");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-semibold text-teal-800">Prontuário Eletrônico</h1>
        <p className="mb-6 text-sm text-slate-500">Entre com os dados da sua clínica</p>
        <LoginForm />
      </div>
    </main>
  );
}
