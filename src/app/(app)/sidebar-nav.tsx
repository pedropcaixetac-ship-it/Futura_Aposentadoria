"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; soon?: boolean };

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {items.map((item) => {
        if (item.soon) {
          return (
            <span key={item.label} className="flex items-center justify-between rounded-md px-3 py-2 text-marinho-400">
              {item.label}
              <span className="rounded bg-marinho-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">em breve</span>
            </span>
          );
        }
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-2 transition ${
              active
                ? "bg-marinho-800 font-medium text-dourado-300 shadow-[inset_3px_0_0_var(--color-dourado-500)]"
                : "text-marinho-100 hover:bg-marinho-800/60 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
