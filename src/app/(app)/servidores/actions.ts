"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseDateInput } from "@/lib/finance";
import { clinicalLoginBlock, parseStaff, staffEditBlock, terminationReasons, validateStaff } from "@/lib/staff";
import { sanitizeTabs } from "@/lib/tabs";
import { TWO_FACTOR_OFF } from "@/lib/totp";

export type FormState = { error: string; ok?: string };

async function findStaff(clinicId: string, id: string) {
  const staff = await prisma.user.findFirst({ where: { id, clinicId } });
  if (!staff) throw new Error("Servidor não encontrado");
  return staff;
}

// Para quem não é gerente do sistema: carrega o servidor e recusa se ele for gerente ou a própria pessoa.
async function findEditableStaff(actor: { id: string; role: Role; clinicId: string }, id: string) {
  const staff = await findStaff(actor.clinicId, id);
  const blocked = staffEditBlock(actor, staff);
  if (blocked) throw new Error(blocked);
  return staff;
}

function duplicateMessage(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const fields = String(error.meta?.target ?? "");
    return fields.includes("cpf") ? "Já existe alguém com este CPF na clínica." : "Já existe alguém com este e-mail na clínica.";
  }
  return null;
}

// Limite de pessoas com acesso ao sistema do plano da clínica (Painel do dono).
async function userLimitError(clinicId: string) {
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId }, include: { plan: true } });
  const max = clinic.plan?.maxUsers;
  if (!max) return null;
  const count = await prisma.user.count({ where: { clinicId, active: true, systemAccess: true } });
  return count >= max
    ? `O plano ${clinic.plan!.name} permite até ${max} pessoas com acesso ao sistema. Tire o acesso de alguém ou fale com o suporte para mudar de plano.`
    : null;
}

export async function saveStaff(id: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser("servidores");
  const input = parseStaff(formData);
  const current = id ? await findStaff(admin.clinicId, id) : null;
  const error =
    validateStaff(input, { needsPassword: !current?.systemAccess }) ??
    staffEditBlock(admin, current, input.role) ??
    clinicalLoginBlock(admin, current, input);
  if (error) return { error };
  if (current?.id === admin.id && (input.role !== "ADMIN" || !input.systemAccess)) {
    return { error: "Você não pode tirar o seu próprio perfil de gerente do sistema." };
  }
  // Quem passa a entrar no sistema conta no limite do plano.
  if (input.systemAccess && !(current?.systemAccess && current.active)) {
    const limit = await userLimitError(admin.clinicId);
    if (limit) return { error: limit };
  }

  const { password, ...data } = input;
  // Profissional sem conselho perde os campos de conselho de vez, para não ficar meio preenchido.
  if (!data.councilNumber) Object.assign(data, { councilType: null, councilUf: null, rqe: null });

  // Sem acesso ao sistema, a senha é aleatória e ninguém a conhece (o login também é bloqueado).
  const passwordHash = password
    ? await bcrypt.hash(password, 10)
    : !data.systemAccess
      ? await bcrypt.hash(randomBytes(32).toString("hex"), 10)
      : undefined;

  let staffId = id;
  try {
    if (id) {
      // Senha que o gerente criou para outra pessoa vale só para o primeiro acesso.
      const reset = password && id !== admin.id ? { passwordHash, mustChangePassword: true } : passwordHash ? { passwordHash } : {};
      await prisma.user.update({ where: { id }, data: { ...data, ...reset } });
      // Senha trocada ou acesso retirado: quem estava conectado sai.
      if (passwordHash && id !== admin.id) await prisma.session.deleteMany({ where: { userId: id } });
    } else {
      const created = await prisma.user.create({
        data: { ...data, clinicId: admin.clinicId, passwordHash: passwordHash!, mustChangePassword: !!password },
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
  const staff = await findEditableStaff(admin, id);
  if (staff.role === "ADMIN") throw new Error("O gerente do sistema tem todas as abas");

  const tabs = sanitizeTabs(staff, formData.getAll("tabs").map(String));
  await prisma.user.update({ where: { id }, data: { customTabs: true, allowedTabs: tabs } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "PERMISSOES_ALTERADAS", entity: "User", entityId: id, details: { abas: tabs } });
  revalidatePath("/servidores");
  redirect("/servidores");
}

export async function resetPermissions(id: string) {
  const admin = await requireUser("servidores");
  await findEditableStaff(admin, id);
  await prisma.user.update({ where: { id }, data: { customTabs: false, allowedTabs: [] } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "PERMISSOES_ALTERADAS", entity: "User", entityId: id, details: { abas: "padrão do perfil" } });
  revalidatePath("/servidores");
  redirect("/servidores");
}

export async function terminateStaff(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser("servidores");
  const staff = await findStaff(admin.clinicId, id);
  if (staff.id === admin.id) return { error: "Você não pode registrar o seu próprio desligamento." };
  const blocked = staffEditBlock(admin, staff);
  if (blocked) return { error: blocked };
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
  const staff = await findEditableStaff(admin, id);
  if (staff.systemAccess) {
    const limit = await userLimitError(admin.clinicId);
    if (limit) throw new Error(limit);
  }
  await prisma.user.update({ where: { id }, data: { active: true, terminatedAt: null, terminationReason: null } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "SERVIDOR_REATIVADO", entity: "User", entityId: id });
  revalidatePath("/servidores");
}

// Quem perdeu o celular e os códigos de recuperação: só o gerente do sistema desliga a verificação
// em duas etapas da pessoa, que pode ligar de novo em "Meu cadastro".
export async function resetTwoFactor(id: string) {
  const admin = await requireUser("servidores");
  if (admin.role !== "ADMIN") throw new Error("Só o gerente do sistema desliga a verificação em duas etapas de outra pessoa");
  await findStaff(admin.clinicId, id);
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: TWO_FACTOR_OFF }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "DUAS_ETAPAS_DESATIVADA", entity: "User", entityId: id, details: { peloGerente: true } });
  revalidatePath(`/servidores/${id}`);
}
