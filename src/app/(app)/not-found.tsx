import Link from "next/link";

// Aparece quando a página não existe ou quando a pessoa não tem acesso ao que tentou abrir
// (ex.: a recepção abrindo um atendimento). Não dizemos qual dos dois, de propósito.
export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md space-y-3 text-center">
      <h1 className="text-lg font-semibold text-marinho-800">Página não encontrada</h1>
      <p className="text-sm text-slate-500">Esta página não existe ou o seu perfil não tem acesso a ela.</p>
      <Link href="/" className="btn-primary inline-block">Voltar ao início</Link>
    </div>
  );
}
