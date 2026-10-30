import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-marinho-900 p-4">
      <div className="card w-full max-w-sm space-y-3 border-t-4 border-t-dourado-500 text-center">
        <h1 className="text-lg font-semibold text-marinho-800">Página não encontrada</h1>
        <p className="text-sm text-slate-500">Confira o endereço ou volte ao início.</p>
        <Link href="/" className="btn-primary inline-block">Voltar ao início</Link>
      </div>
    </main>
  );
}
