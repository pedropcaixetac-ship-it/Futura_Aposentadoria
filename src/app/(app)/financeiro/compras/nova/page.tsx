import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { dateInput, paymentMethodLabel, paymentMethods, today } from "@/lib/finance";
import { PurchaseForm } from "./purchase-form";

export default async function NewPurchasePage() {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) notFound();

  // Fornecedores das notas anteriores, para sugerir o nome e preencher o CNPJ.
  const suppliers = await prisma.purchase.findMany({
    where: { clinicId: user.clinicId },
    distinct: ["supplierName"],
    orderBy: { supplierName: "asc" },
    select: { supplierName: true, supplierCnpj: true },
  });

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Lançar nota fiscal de compra</h2>
        <Link href="/financeiro/compras" className="text-sm text-marinho-700 hover:underline">Voltar para Compras</Link>
      </div>
      <PurchaseForm
        suppliers={suppliers.map((s) => ({ name: s.supplierName, cnpj: s.supplierCnpj }))}
        paymentMethods={paymentMethods.map((m) => ({ value: m, label: paymentMethodLabel[m] }))}
        today={dateInput(today())}
      />
    </div>
  );
}
