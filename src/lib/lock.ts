// Operações que disputam a mesma coisa passam uma de cada vez: o mesmo horário da agenda, a mesma consulta,
// a mesma cobrança. Sem isso, duas pessoas (a recepção e o paciente pelo aplicativo, por exemplo) que escolhem
// o mesmo horário no mesmo segundo veem as duas o horário livre e as duas marcam.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { occupiesSlot } from "./agenda";

export type Tx = Prisma.TransactionClient;

// Cada chave (o profissional, o paciente, a consulta...) vira uma trava no banco, que dura até o fim da operação.
// Quem chega depois espera a anterior terminar e então confere tudo de novo, já vendo o que ela gravou.
export function withLock<T>(keys: string[], fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      // Sempre na mesma ordem, para duas operações não ficarem esperando uma pela outra.
      for (const key of [...new Set(keys)].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      }
      return fn(tx);
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

// Já há alguém marcado (e não desmarcado) que encosta neste horário?
export async function slotTaken(
  tx: Tx,
  where: { clinicId: string; professionalId: string; start: Date; end: Date; exceptId?: string | null },
) {
  const others = await tx.appointment.findMany({
    where: {
      clinicId: where.clinicId,
      professionalId: where.professionalId,
      startsAt: { lt: where.end },
      endsAt: { gt: where.start },
      ...(where.exceptId && { NOT: { id: where.exceptId } }),
    },
    select: { status: true, patient: { select: { name: true } }, startsAt: true },
  });
  return others.find((o) => occupiesSlot(o.status)) ?? null;
}
