"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// root: a aba principal, que só fica marcada no endereço exato.
export function FinanceTabs({ tabs, root = "/financeiro" }: { tabs: { href: string; label: string }[]; root?: string }) {
  const pathname = usePathname();
  return (
    <nav className="no-print flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const active = tab.href === root ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              active ? "border-dourado-500 font-medium text-marinho-800" : "border-transparent text-slate-500 hover:text-marinho-700"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
