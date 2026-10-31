import { requireUser } from "@/lib/auth";
import { canManageCharges, canManageFinance } from "@/lib/permissions";
import { FinanceTabs } from "./finance-tabs";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("financeiro");
  const admin = canManageFinance(user);
  const tabs = [
    ...(admin ? [{ href: "/financeiro", label: "Resumo" }] : []),
    ...(canManageCharges(user) ? [{ href: "/financeiro/receitas", label: "Receitas" }] : []),
    ...(canManageCharges(user) ? [{ href: "/financeiro/notas", label: "Notas fiscais" }] : []),
    ...(admin ? [{ href: "/financeiro/despesas", label: "Despesas" }] : []),
    ...(admin ? [{ href: "/financeiro/compras", label: "Compras" }] : []),
    ...(admin ? [{ href: "/financeiro/repasse", label: "Repasse" }] : []),
    ...(admin ? [{ href: "/financeiro/faturamento", label: "Faturamento" }] : []),
    ...(admin ? [{ href: "/financeiro/convenios", label: "Convênios" }] : []),
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
