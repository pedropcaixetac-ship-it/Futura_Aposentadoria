"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { platformAudit, requirePlatformUser } from "@/lib/painel-auth";
import { teamChangeError, temporaryPassword } from "@/lib/painel-equipe";
import { TWO_FACTOR_OFF } from "@/lib/totp";

export type FormState = { error: string; ok?: string };

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Quem entra com a senha provisória é obrigado a criar a própria no primeiro acesso.
export async function createTeamMember(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePlatformUser({ owner: true });
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const owner = formData.get("owner") === "on";
  if (!name) return { error: "Informe o nome." };
  if (!looksLikeEmail(email)) return { error: "Informe um e-mail válido." };
  if (await prisma.platformUser.findUnique({ where: { email } })) return { error: "Já existe alguém da equipe com este e-mail." };

  const password = temporaryPassword();
  const created = await prisma.platformUser.create({
    data: { name, email, owner, passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
  });
  await platformAudit({ userId: me.id, action: "EQUIPE_CRIADA", details: { pessoa: created.id, nome: name, dono: owner } });
  revalidatePath("/painel/equipe");
  return { error: "", ok: `${name} cadastrado. Senha provisória: ${password} (anote agora, ela não aparece de novo).` };
}

async function target(id: string) {
  return prisma.platformUser.findUniqueOrThrow({ where: { id } });
}

export async function setTeamMemberActive(id: string, active: boolean) {
  const me = await requirePlatformUser({ owner: true });
  const person = await target(id);
  if (teamChangeError(me, person, "bloquear")) return;
  await prisma.platformUser.update({ where: { id }, data: { active } });
  // Bloqueado sai na hora de todos os aparelhos.
  if (!active) await prisma.platformSession.deleteMany({ where: { userId: id } });
  await platformAudit({ userId: me.id, action: active ? "EQUIPE_REATIVADA" : "EQUIPE_BLOQUEADA", details: { pessoa: id, nome: person.name } });
  revalidatePath("/painel/equipe");
}

export async function setTeamMemberOwner(id: string, owner: boolean) {
  const me = await requirePlatformUser({ owner: true });
  const person = await target(id);
  if (teamChangeError(me, person, "dono")) return;
  await prisma.platformUser.update({ where: { id }, data: { owner } });
  await platformAudit({ userId: me.id, action: "EQUIPE_DONO", details: { pessoa: id, nome: person.name, dono: owner } });
  revalidatePath("/painel/equipe");
}

// Esqueceu a senha: gera uma provisória, derruba as sessões abertas e obriga a trocar ao entrar.
export async function resetTeamMemberPassword(id: string): Promise<FormState> {
  const me = await requirePlatformUser({ owner: true });
  const person = await target(id);
  if (person.id === me.id) return { error: "Para a sua própria senha, use Minha conta." };
  const password = temporaryPassword();
  await prisma.platformUser.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
  await prisma.platformSession.deleteMany({ where: { userId: id } });
  await platformAudit({ userId: me.id, action: "EQUIPE_SENHA_PROVISORIA", details: { pessoa: id, nome: person.name } });
  revalidatePath("/painel/equipe");
  return { error: "", ok: `Senha provisória de ${person.name}: ${password} (anote agora, ela não aparece de novo).` };
}

// Perdeu o celular e os códigos de recuperação: o dono desliga e a pessoa liga de novo em Minha conta.
export async function resetTeamMemberTwoFactor(id: string) {
  const me = await requirePlatformUser({ owner: true });
  const person = await target(id);
  if (person.id === me.id) return;
  await prisma.platformUser.update({ where: { id }, data: { ...TWO_FACTOR_OFF } });
  await platformAudit({ userId: me.id, action: "EQUIPE_DUAS_ETAPAS_REMOVIDA", details: { pessoa: id, nome: person.name } });
  revalidatePath("/painel/equipe");
}
