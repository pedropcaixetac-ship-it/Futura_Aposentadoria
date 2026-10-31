"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type MealKind, type MealStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { kitchenDate, MEALS, mealLabel, mealStatusLabel } from "@/lib/cozinha";

export type FormState = { error: string; ok?: string };

const STATUSES: MealStatus[] = ["ENTREGUE", "RECUSOU", "NAO_SERVIDO"];

// Copa: marca a refeição do leito como entregue, recusada ou não servida (sempre no dia de hoje).
export async function recordMeal(admissionId: string, meal: MealKind, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("cozinha");
  const status = String(formData.get("status") ?? "") as MealStatus;
  if (!STATUSES.includes(status) || !MEALS.some((m) => m.kind === meal)) return { error: "Escolha a situação." };
  const note = String(formData.get("note") ?? "").trim() || null;
  if (status !== "ENTREGUE" && !note) return { error: "Diga o motivo." };
  const admission = await prisma.admission.findFirst({ where: { id: admissionId, clinicId: user.clinicId, dischargedAt: null } });
  if (!admission) return { error: "O paciente já teve alta." };
  try {
    const record = await prisma.mealDelivery.create({
      data: { clinicId: user.clinicId, admissionId, date: kitchenDate(), meal, status, note, recordedById: user.id },
    });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "REFEICAO_REGISTRADA", entity: "MealDelivery", entityId: record.id, patientId: admission.patientId, details: { refeicao: mealLabel[meal], situacao: mealStatusLabel[status] } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Esta refeição já foi marcada. Anule para marcar de novo." };
    throw e;
  }
  revalidatePath("/cozinha");
  return { error: "", ok: "Registrado." };
}

export async function cancelMeal(mealId: string) {
  const user = await requireUser("cozinha");
  const record = await prisma.mealDelivery.findFirst({ where: { id: mealId, clinicId: user.clinicId, canceledAt: null }, include: { admission: { select: { patientId: true } } } });
  if (!record) return;
  await prisma.mealDelivery.update({ where: { id: record.id }, data: { canceledAt: new Date(), canceledById: user.id, cancelReason: "Marcado errado" } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "REFEICAO_ANULADA", entity: "MealDelivery", entityId: record.id, patientId: record.admission.patientId });
  revalidatePath("/cozinha");
}
