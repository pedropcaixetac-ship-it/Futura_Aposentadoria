"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { reportBrowserError } from "./relatar-problema/actions";

// O sistema foi publicado de novo enquanto a tela estava aberta: os botões da tela antiga não
// existem mais no servidor. Não é defeito; basta recarregar a página.
function isOutdatedPage(error: Error) {
  return /failed-to-find-server-action|was not found on the server/i.test(error.message);
}

// Tela mostrada quando algo dá errado. Erros do servidor já ficam registrados sozinhos
// (src/instrumentation.ts) e trazem um código; os que acontecem só no navegador são avisados daqui.
// "Tentar de novo" recarrega a página inteira, que resolve também a tela desatualizada.
export default function AppError({ error }: { error: Error & { digest?: string } }) {
  const pathname = usePathname();
  const outdated = isOutdatedPage(error);
  useEffect(() => {
    if (!error.digest && !outdated) reportBrowserError(error.message, pathname).catch(() => {});
  }, [error, pathname, outdated]);

  if (outdated) {
    return (
      <div className="card mx-auto mt-10 max-w-md space-y-3 text-center">
        <h1 className="text-lg font-semibold text-marinho-800">O sistema foi atualizado</h1>
        <p className="text-sm text-slate-500">
          Saiu uma versão nova enquanto esta tela estava aberta. Recarregue a página e faça de novo o que estava fazendo.
        </p>
        <button onClick={() => window.location.reload()} className="btn-primary">Recarregar</button>
      </div>
    );
  }

  const params = new URLSearchParams({ de: pathname, ...(error.digest && { codigo: error.digest }) });
  return (
    <div className="card mx-auto mt-10 max-w-md space-y-3 text-center">
      <h1 className="text-lg font-semibold text-marinho-800">Algo deu errado nesta tela</h1>
      <p className="text-sm text-slate-500">
        O problema já foi registrado para o suporte. Tente de novo; se continuar, conte o que você estava fazendo.
      </p>
      {error.digest && <p className="text-xs text-slate-400">Código: <span className="font-mono">{error.digest}</span></p>}
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={() => window.location.reload()} className="btn-primary">Tentar de novo</button>
        <Link href={`/relatar-problema?${params}`} className="btn-secondary">Relatar problema</Link>
      </div>
    </div>
  );
}
