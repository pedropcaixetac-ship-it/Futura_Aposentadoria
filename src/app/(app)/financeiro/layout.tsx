import { requireUser } from "@/lib/auth";
import { canManageCharges, canManageFinance } from "@/lib/permissions";
import { FinanceTabs } from "./finance-tabs";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const admin = canManageFinance(user);
  const tabs = [
    ...(admin ? [{ href: "/financeiro", label: "Resumo" }] : []),
    ...(canManageCharges(user) ? [{ href: "/financeiro/receitas", label: "Receitas" }] : []),
    ...(admin ? [{ href: "/financeiro/despesas", label: "Despesas" }] : []),
    ...(admin ? [{ href: "/financeiro/compras", label: "Compras" }] : []),
    { href: "/financeiro/repasse", label: admin ? "Repasse" : "Meu repasse" },
    ...(admin ? [{ href: "/financeiro/precos", label: "Preços e recibo" }] : []),
  ];
  return (
    <div className="space-y-5">
      <h1 className="no-print text-2xl font-semibold">Financeiro</h1>
      {tabs.length > 1 && <FinanceTabs tabs={tabs} />}
      {children}
    </div>
  );
}
