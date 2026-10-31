import Link from "next/link";

const tabs = [
  { key: "hoje", label: "Sessões e tratamentos", href: "/quimioterapia" },
  { key: "novo", label: "Novo tratamento", href: "/quimioterapia/novo" },
  { key: "protocolos", label: "Protocolos", href: "/quimioterapia/protocolos" },
] as const;

export function ChemoNav({ current }: { current: (typeof tabs)[number]["key"] }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 text-sm">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={`-mb-px border-b-2 px-3 py-2 ${t.key === current ? "border-dourado-500 font-medium text-marinho-800" : "border-transparent text-slate-500 hover:text-marinho-700"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
