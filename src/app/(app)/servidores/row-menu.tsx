"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Props = {
  id: string;
  name: string;
  active: boolean;
  systemAccess: boolean;
  isSelf: boolean;
  // Quem não é gerente do sistema não altera o cadastro de um gerente nem o próprio.
  locked: boolean;
  reactivate: () => Promise<void>;
};

// Altura aproximada do menu aberto (três opções), para saber se cabe embaixo do botão.
const MENU_HEIGHT = 160;

// Os "três pontinhos" no fim de cada linha da tabela de servidores.
export function RowMenu({ id, name, active, systemAccess, isSelf, locked, reactivate }: Props) {
  // Posição na tela de onde o menu abre. O menu fica "solto" (fixed) para não ser cortado pela tabela.
  const [open, setOpen] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    if (open) return setOpen(null);
    const rect = event.currentTarget.getBoundingClientRect();
    const right = window.innerWidth - rect.right;
    // Perto do fim da tela (ex.: último servidor da lista), o menu abre para cima.
    const roomBelow = window.innerHeight - rect.bottom;
    setOpen(roomBelow < MENU_HEIGHT && rect.top > roomBelow ? { bottom: window.innerHeight - rect.top + 4, right } : { top: rect.bottom + 4, right });
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
          {locked && <p className="px-4 py-2 text-slate-500">Você não pode alterar este cadastro.</p>}
          {!locked && <Link href={`/servidores/${id}`} className={item}>Editar cadastro</Link>}
          {!locked && systemAccess && <Link href={`/servidores/${id}/permissoes`} className={item}>Editar permissões</Link>}
          {!locked && active && !isSelf && (
            <Link href={`/servidores/${id}/desligamento`} className={`${item} text-red-700 hover:bg-red-50`}>
              Registrar desligamento
            </Link>
          )}
          {!locked && !active && (
            <form action={async () => { await reactivate(); setOpen(null); }}>
              <button className={item}>{systemAccess ? "Reativar acesso" : "Reativar"}</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
