import { requireUser } from "@/lib/auth";
import { FinanceTabs } from "../financeiro/finance-tabs";

export default async function MyFinanceLayout({ children }: { children: React.ReactNode }) {
  await requireUser("meu-financeiro");
  const tabs = [
    { href: "/meu-financeiro", label: "Resumo" },
    { href: "/meu-financeiro/notas", label: "Notas fiscais" },
  ];
  return (
    <div className="space-y-5">
      <h1 className="no-print text-2xl font-semibold">Meu financeiro</h1>
      <FinanceTabs tabs={tabs} root="/meu-financeiro" />
      {children}
    </div>
  );
}
