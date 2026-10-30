import { FinanceTabs } from "../financeiro/finance-tabs";
import { requireAccountingPage } from "./data";

export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  await requireAccountingPage();
  const tabs = [
    { href: "/contabilidade", label: "Resumo" },
    { href: "/contabilidade/funcionarios", label: "Funcionários" },
    { href: "/contabilidade/folha", label: "Folha do mês" },
    { href: "/contabilidade/obrigacoes", label: "Impostos e obrigações" },
    { href: "/contabilidade/contador", label: "Contador" },
  ];
  return (
    <div className="space-y-5">
      <h1 className="no-print text-2xl font-semibold">Contabilidade e trabalhista</h1>
      <FinanceTabs tabs={tabs} root="/contabilidade" />
      {children}
    </div>
  );
}
