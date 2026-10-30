"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { matchesCouncil, parseLoginId } from "@/lib/login";

// Encontra o usuário pelo e-mail, CPF ou número do conselho, dentro da clínica.
async function findUser(clinicId: string, login: string) {
  const id = parseLoginId(login);
  if (!id) return null;
  if (id.kind === "email") return prisma.user.findUnique({ where: { clinicId_email: { clinicId, email: id.email } } });
  if (id.kind === "cpf") return prisma.user.findUnique({ where: { clinicId_cpf: { clinicId, cpf: id.cpf } } });
  const professionals = await prisma.user.findMany({ where: { clinicId, councilNumber: { not: null } } });
  const found = professionals.filter((u) => matchesCouncil(u, id));
  // Dois profissionais com o mesmo número (ex.: um CRM e um CRP): pede o e-mail ou o CPF.
  return found.length === 1 ? found[0] : null;
}

export async function login(_: { error: string }, formData: FormData) {
  const slug = String(formData.get("clinic") ?? "").trim().toLowerCase();
  const loginId = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const clinic = await prisma.clinic.findUnique({ where: { slug } });
  const user = clinic ? await findUser(clinic.id, loginId) : null;
  const ok = user?.active && (await bcrypt.compare(password, user.passwordHash));

  if (!clinic || !user || !ok) {
    if (clinic) await audit({ clinicId: clinic.id, userId: user?.id, action: "LOGIN_FALHOU", entity: "User", details: { login: loginId } });
    return { error: "Clínica, login ou senha incorretos." };
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
