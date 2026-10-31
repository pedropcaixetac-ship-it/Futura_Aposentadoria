import Link from "next/link";

export function BillsNav({ current }: { current: "contas" | "precos" }) {
  const tabs = [
    { key: "contas", label: "Contas", href: "/contas" },
    { key: "precos", label: "Tabela de preços", href: "/contas/precos" },
  ] as const;
  return (
    <nav className="no-print flex flex-wrap gap-1 border-b border-slate-200 text-sm">
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
