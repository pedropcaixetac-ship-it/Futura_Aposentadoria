"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// Campo de busca que atualiza a lista enquanto a pessoa digita.
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (value.trim() === initial) return;
    const timer = setTimeout(() => {
      const q = value.trim();
      router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [value, initial, pathname, router]);

  return (
    <input
      type="search"
      name="q"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Nome, CPF, telefone, nascimento (dd/mm/aaaa) ou convênio"
      aria-label="Buscar paciente"
      autoFocus
      className="input max-w-xl"
    />
  );
}
