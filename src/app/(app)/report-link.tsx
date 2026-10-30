"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Leva junto a tela em que a pessoa estava, para o suporte saber onde olhar.
export function ReportLink() {
  const pathname = usePathname();
  const from = pathname.startsWith("/relatar-problema") ? "" : `?de=${encodeURIComponent(pathname)}`;
  return (
    <Link href={`/relatar-problema${from}`} className="block rounded-md px-3 py-2 text-sm text-marinho-100 hover:bg-marinho-800/60 hover:text-dourado-300">
      Relatar problema
    </Link>
  );
}
