import Link from "next/link";
import { requirePlatformUser } from "@/lib/painel-auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { ClinicForm } from "../../clinic-form";
import { createClinic } from "../../actions";

export default async function NewClinicPage() {
  await requirePlatformUser();
  const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { priceCents: "asc" } });
  return (
    <div className="space-y-4">
      <Link href="/painel" className="text-sm text-marinho-600 hover:underline">← Clínicas</Link>
      <h1 className="text-2xl font-semibold text-marinho-800">Cadastrar clínica</h1>
      <ClinicForm action={createClinic} plans={plans.map((p) => ({ id: p.id, name: p.name, price: `${formatMoney(p.priceCents)}/mês` }))} />
    </div>
  );
}
