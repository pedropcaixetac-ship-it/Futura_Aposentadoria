"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { matchesCouncil, parseLoginId } from "@/lib/login";
import { UFS } from "@/lib/patient";

// Encontra o usuário pelo e-mail, CPF ou número do conselho (com a UF), dentro da clínica.
async function findUser(clinicId: string, id: NonNullable<ReturnType<typeof parseLoginId>>, uf: string) {
  if (id.kind === "email") return prisma.user.findUnique({ where: { clinicId_email: { clinicId, email: id.email } } });
  if (id.kind === "cpf") return prisma.user.findUnique({ where: { clinicId_cpf: { clinicId, cpf: id.cpf } } });
  const professionals = await prisma.user.findMany({ where: { clinicId, councilNumber: { not: null } } });
  const found = professionals.filter((u) => matchesCouncil(u, id, uf));
  // Dois profissionais com o mesmo número (ex.: um CRM e um CRP): pede o e-mail ou o CPF.
  return found.length === 1 ? found[0] : null;
}

export async function login(_: { error: string }, formData: FormData) {
  const slug = String(formData.get("clinic") ?? "").trim().toLowerCase();
  const loginId = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const id = parseLoginId(loginId);
  // A UF vem do campo próprio ou de quem digitou junto, como "38526/GO".
  const uf = String(formData.get("uf") ?? "") || (id?.kind === "council" ? (id.letters.find((l) => UFS.includes(l)) ?? "") : "");
  if (id?.kind === "council" && !uf) return { error: "Escolha a UF do seu conselho." };

  const clinic = await prisma.clinic.findUnique({ where: { slug } });
  const user = clinic && id ? await findUser(clinic.id, id, uf) : null;
  const ok = user?.active && user.systemAccess && (await bcrypt.compare(password, user.passwordHash));

  if (!clinic || !user || !ok) {
    if (clinic) await audit({ clinicId: clinic.id, userId: user?.id, action: "LOGIN_FALHOU", entity: "User", details: { login: loginId } });
    return { error: "Clínica, login ou senha incorretos." };
  }

  await createSession(user.id);
  await audit({ clinicId: clinic.id, userId: user.id, action: "LOGIN", entity: "User", entityId: user.id });
  redirect("/");
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await audit({ clinicId: user.clinicId, userId: user.id, action: "LOGOUT", entity: "User", entityId: user.id });
  await destroySession();
  redirect("/login");
}
