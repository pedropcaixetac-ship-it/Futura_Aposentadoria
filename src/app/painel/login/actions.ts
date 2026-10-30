"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createPlatformSession, destroyPlatformSession, getPlatformUser, platformAudit } from "@/lib/painel-auth";

export async function platformLogin(_: { error: string }, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = email ? await prisma.platformUser.findUnique({ where: { email } }) : null;
  const ok = user?.active && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !ok) {
    await platformAudit({ userId: user?.id, action: "PAINEL_LOGIN_FALHOU", details: { email } });
    return { error: "E-mail ou senha incorretos." };
  }

  await createPlatformSession(user.id);
  await platformAudit({ userId: user.id, action: "PAINEL_LOGIN" });
  redirect("/painel");
}

export async function platformLogout() {
  const user = await getPlatformUser();
  if (user) await platformAudit({ userId: user.id, action: "PAINEL_LOGOUT" });
  await destroyPlatformSession();
  redirect("/painel/login");
}
