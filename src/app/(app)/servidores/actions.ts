"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseDateInput } from "@/lib/finance";
import { parseStaff, terminationReasons, validateStaff } from "@/lib/staff";
import { sanitizeTabs } from "@/lib/tabs";

export type FormState = { error: string; ok?: string };

async function findStaff(clinicId: string, id: string) {
  const staff = await prisma.user.findFirst({ where: { id, clinicId } });
  if (!staff) throw new Error("Servidor não encontrado");
  return staff;
}

function duplicateMessage(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const fields = String(error.meta?.target ?? "");
    return fields.includes("cpf") ? "Já existe alguém com este CPF na clínica." : "Já existe alguém com este e-mail na clínica.";
  }
  return null;
}

export async function saveStaff(id: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser("servidores");
  const input = parseStaff(formData);
  const current = id ? await findStaff(admin.clinicId, id) : null;
  const error = validateStaff(input, { needsPassword: !current?.systemAccess });
  if (error) return { error };
  if (current?.id === admin.id && (input.role !== "ADMIN" || !input.systemAccess)) {
    return { error: "Você não pode tirar o seu próprio acesso de administrador." };
  }

  const { password, ...data } = input;
  // Profissional sem conselho perde os campos de conselho de vez, para não ficar meio preenchido.
  if (!data.councilNumber) Object.assign(data, { councilType: null, councilUf: null });

  // Sem acesso ao sistema, a senha é aleatória e ninguém a conhece (o login também é bloqueado).
  const passwordHash = password
    ? await bcrypt.hash(password, 10)
    : !data.systemAccess
      ? await bcrypt.hash(randomBytes(32).toString("hex"), 10)
      : undefined;

  let staffId = id;
  try {
    if (id) {
      await prisma.user.update({ where: { id }, data: { ...data, ...(passwordHash && { passwordHash }) } });
      // Senha trocada ou acesso retirado: quem estava conectado sai.
      if (passwordHash && id !== admin.id) await prisma.session.deleteMany({ where: { userId: id } });
    } else {
      const created = await prisma.user.create({
        data: { ...data, clinicId: admin.clinicId, passwordHash: passwordHash! },
      });
      staffId = created.id;
    }
  } catch (e) {
    const message = duplicateMessage(e);
    if (message) return { error: message };
    throw e;
  }

  await audit({
    clinicId: admin.clinicId,
    userId: admin.id,
    action: id ? "SERVIDOR_ALTERADO" : "SERVIDOR_CRIADO",
    entity: "User",
    entityId: staffId,
    details: { name: data.name, role: data.role, acessoAoSistema: data.systemAccess, ...(password && id && { senhaTrocada: true }) },
  });
  revalidatePath("/servidores");
  redirect("/servidores");
}

export async function savePermissions(id: string, formData: FormData) {
  const admin = await requireUser("servidores");
  const staff = await findStaff(admin.clinicId, id);
  if (staff.role === "ADMIN") throw new Error("Administradores têm todas as abas");

  const tabs = sanitizeTabs(staff, formData.getAll("tabs").map(String));
  await prisma.user.update({ where: { id }, data: { customTabs: true, allowedTabs: tabs } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "PERMISSOES_ALTERADAS", entity: "User", entityId: id, details: { abas: tabs } });
  revalidatePath("/servidores");
  redirect("/servidores");
}

export async function resetPermissions(id: string) {
  const admin = await requireUser("servidores");
  await findStaff(admin.clinicId, id);
  await prisma.user.update({ where: { id }, data: { customTabs: false, allowedTabs: [] } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "PERMISSOES_ALTERADAS", entity: "User", entityId: id, details: { abas: "padrão do perfil" } });
  revalidatePath("/servidores");
  redirect("/servidores");
}

export async function terminateStaff(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser("servidores");
  const staff = await findStaff(admin.clinicId, id);
  if (staff.id === admin.id) return { error: "Você não pode registrar o seu próprio desligamento." };
  if (!staff.active) return { error: "Esta pessoa já está desligada." };

  const date = parseDateInput(String(formData.get("terminatedAt") ?? ""));
  const reason = String(formData.get("reason") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!date) return { error: "Informe a data do desligamento." };
  if (!terminationReasons.includes(reason)) return { error: "Escolha o motivo do desligamento." };
  if (reason === "Outro" && !notes) return { error: "Descreva o motivo nas observações." };

  const terminationReason = notes ? `${reason}: ${notes}` : reason;
  // A pessoa sai do sistema na hora, mas o cadastro fica: ela assina atendimentos antigos.
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { active: false, terminatedAt: date, terminationReason } }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "SERVIDOR_DESLIGADO", entity: "User", entityId: id, details: { motivo: terminationReason } });
  revalidatePath("/servidores");
  redirect("/servidores");
}

export async function reactivateStaff(id: string) {
  const admin = await requireUser("servidores");
  await findStaff(admin.clinicId, id);
  await prisma.user.update({ where: { id }, data: { active: true, terminatedAt: null, terminationReason: null } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "SERVIDOR_REATIVADO", entity: "User", entityId: id });
  revalidatePath("/servidores");
}
