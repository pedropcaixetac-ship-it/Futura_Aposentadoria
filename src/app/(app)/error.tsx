"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { reportBrowserError } from "./relatar-problema/actions";

// Tela mostrada quando algo dá errado. Erros do servidor já ficam registrados sozinhos
// (src/instrumentation.ts) e trazem um código; os que acontecem só no navegador são avisados daqui.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!error.digest) reportBrowserError(error.message, pathname).catch(() => {});
  }, [error, pathname]);

  const params = new URLSearchParams({ de: pathname, ...(error.digest && { codigo: error.digest }) });
  return (
    <div className="card mx-auto mt-10 max-w-md space-y-3 text-center">
      <h1 className="text-lg font-semibold text-marinho-800">Algo deu errado nesta tela</h1>
      <p className="text-sm text-slate-500">
        O problema já foi registrado para o suporte. Tente de novo; se continuar, conte o que você estava fazendo.
      </p>
      {error.digest && <p className="text-xs text-slate-400">Código: <span className="font-mono">{error.digest}</span></p>}
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={reset} className="btn-primary">Tentar de novo</button>
        <Link href={`/relatar-problema?${params}`} className="btn-secondary">Relatar problema</Link>
      </div>
    </div>
  );
}
