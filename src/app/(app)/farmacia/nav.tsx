import Link from "next/link";

// Abas da farmácia.
export function PharmacyNav({ current }: { current: "dispensacao" | "estoque" }) {
  const tabs = [
    { key: "dispensacao", label: "Dispensação", href: "/farmacia" },
    { key: "estoque", label: "Estoque", href: "/farmacia/estoque" },
  ] as const;
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 ${t.key === current ? "border-dourado-500 font-medium text-marinho-800" : "border-transparent text-slate-500 hover:text-marinho-700"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
