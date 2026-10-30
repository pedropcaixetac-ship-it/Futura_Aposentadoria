"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Props = {
  id: string;
  name: string;
  active: boolean;
  isSelf: boolean;
  reactivate: () => Promise<void>;
};

// Os "três pontinhos" no fim de cada linha da tabela de servidores.
export function RowMenu({ id, name, active, isSelf, reactivate }: Props) {
  // Posição na tela de onde o menu abre. O menu fica "solto" (fixed) para não ser cortado pela tabela.
  const [open, setOpen] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    if (open) return setOpen(null);
    const rect = event.currentTarget.getBoundingClientRect();
    setOpen({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(null);
    };
    const dismiss = () => setOpen(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  const item = "block w-full px-4 py-2 text-left hover:bg-marinho-50";

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={toggle}
        aria-label={`Opções de ${name}`}
        aria-expanded={!!open}
        className="rounded-md px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-marinho-800"
      >
        ⋮
      </button>
      {open && (
        <div style={open} className="fixed z-30 w-56 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          <Link href={`/servidores/${id}`} className={item}>Editar cadastro</Link>
          <Link href={`/servidores/${id}/permissoes`} className={item}>Editar permissões</Link>
          {active && !isSelf && (
            <Link href={`/servidores/${id}/desligamento`} className={`${item} text-red-700 hover:bg-red-50`}>
              Registrar desligamento
            </Link>
          )}
          {!active && (
            <form action={reactivate}>
              <button className={item}>Reativar acesso</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
