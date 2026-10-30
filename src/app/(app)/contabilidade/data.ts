import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessAccounting } from "@/lib/permissions";
import { defaultObligations } from "@/lib/accounting";

export async function requireAccountingPage() {
  const user = await requireUser();
  if (!canAccessAccounting(user)) notFound();
  return user;
}

// Na primeira vez que a clínica abre a aba, ela já recebe a lista de obrigações mais comuns.
export async function ensureObligations(clinicId: string) {
  if ((await prisma.taxObligation.count({ where: { clinicId } })) > 0) return;
  await prisma.taxObligation.createMany({ data: defaultObligations.map((o) => ({ ...o, clinicId })) });
}
