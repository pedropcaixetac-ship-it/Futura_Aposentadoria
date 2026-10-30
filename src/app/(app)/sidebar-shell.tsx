"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// No computador a barra lateral fica sempre aberta. No celular ela vira uma gaveta aberta pelo botão ☰.
export function SidebarShell({ clinicName, children }: { clinicName: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <div className="no-print sticky top-0 z-40 flex items-center gap-3 bg-marinho-900 px-4 py-3 text-white md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          className="rounded-md px-2 py-1 text-2xl leading-none hover:bg-marinho-800"
        >
          ☰
        </button>
        <span className="truncate font-semibold text-dourado-300">{clinicName}</span>
      </div>

      {open && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto bg-marinho-900 p-4 text-white transition-transform md:sticky md:top-0 md:z-auto md:h-screen md:w-64 md:max-w-none md:shrink-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
          className="self-end rounded-md px-2 text-2xl leading-none text-marinho-100 hover:text-white md:hidden"
        >
          ×
        </button>
        {/* Clicar num link fecha a gaveta, mesmo quando é a página atual. */}
        <div
          className="flex flex-1 flex-col gap-6"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {children}
        </div>
      </aside>
    </>
  );
}
