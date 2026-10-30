import { prisma } from "./db";

// Convênios em uso, para escolher na ficha do paciente. "keepId" mantém na lista o convênio
// que o paciente já tem, mesmo que tenha saído de uso, para a ficha não perdê-lo ao salvar.
export function activeHealthPlans(clinicId: string, keepId?: string | null) {
  return prisma.healthPlan.findMany({
    where: { clinicId, OR: [{ active: true }, ...(keepId ? [{ id: keepId }] : [])] },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
