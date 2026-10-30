"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function login(_: { error: string }, formData: FormData) {
  const slug = String(formData.get("clinic") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const clinic = await prisma.clinic.findUnique({ where: { slug } });
  const user = clinic
    ? await prisma.user.findUnique({ where: { clinicId_email: { clinicId: clinic.id, email } } })
    : null;
  const ok = user?.active && (await bcrypt.compare(password, user.passwordHash));

  if (!clinic || !user || !ok) {
    if (clinic) await audit({ clinicId: clinic.id, userId: user?.id, action: "LOGIN_FALHOU", entity: "User", details: { email } });
    return { error: "Clínica, e-mail ou senha incorretos." };
  }

  await createSession(user.id);
  await audit({ clinicId: clinic.id, userId: user.id, action: "LOGIN", entity: "User", entityId: user.id });
  redirect("/pacientes");
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await audit({ clinicId: user.clinicId, userId: user.id, action: "LOGOUT", entity: "User", entityId: user.id });
  await destroySession();
  redirect("/login");
}
