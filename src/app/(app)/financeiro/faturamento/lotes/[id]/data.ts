import { prisma } from "@/lib/db";
import type { BatchInput } from "@/lib/tiss-xml";

// Lote com tudo o que o arquivo XML precisa. Null se não for desta clínica.
export async function loadBatch(clinicId: string, id: string) {
  const batch = await prisma.claimBatch.findFirst({
    where: { id, clinicId },
    include: {
      healthPlan: true,
      clinic: true,
      claims: {
        orderBy: { number: "asc" },
        include: {
          patient: { select: { name: true } },
          professional: { select: { name: true, jobTitle: true, sex: true, councilType: true, councilNumber: true, councilUf: true } },
        },
      },
    },
  });
  if (!batch) return null;
  const input: BatchInput = {
    number: batch.number,
    createdAt: batch.createdAt,
    plan: { ansCode: batch.healthPlan.ansCode ?? "", providerCode: batch.healthPlan.providerCode },
    clinic: { cnpj: batch.clinic.cnpj, cnes: batch.clinic.cnes ?? "" },
    claims: batch.claims,
  };
  return { batch, input };
}
