"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// "Entendi": o aviso some só para esta pessoa.
export async function dismissNotice(noticeId: string) {
  const user = await requireUser();
  const notice = await prisma.platformNotice.findUnique({ where: { id: noticeId }, select: { clinicId: true } });
  if (!notice || (notice.clinicId && notice.clinicId !== user.clinicId)) return;
  await prisma.noticeDismissal.upsert({
    where: { noticeId_userId: { noticeId, userId: user.id } },
    create: { noticeId, userId: user.id },
    update: {},
  });
  revalidatePath("/", "layout");
}
