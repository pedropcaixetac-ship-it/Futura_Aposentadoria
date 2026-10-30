"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { platformAudit, requirePlatformUser } from "@/lib/painel-auth";
import { parseClinic, parseManager, STARTER_TEMPLATES, validateClinic, validateManager } from "@/lib/painel";

export type FormState = { error: string; ok?: string };

function duplicateSlug(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// Cria a clínica vazia, o primeiro gerente do sistema e os modelos de atendimento iniciais.
// Depois disso, o próprio gerente cadastra a equipe e os pacientes.
export async function createClinic(_: FormState, formData: FormData): Promise<FormState> {
  const owner = await requirePlatformUser();
  const clinic = parseClinic(formData);
  const manager = parseManager(formData);
  const error = validateClinic(clinic) ?? validateManager(manager);
  if (error) return { error };

  let clinicId: string;
  try {
    clinicId = await prisma.$transaction(async (tx) => {
      const created = await tx.clinic.create({ data: clinic });
      await tx.user.create({
        data: {
          clinicId: created.id,
          name: manager.name,
          email: manager.email,
          cpf: manager.cpf,
          passwordHash: await bcrypt.hash(manager.password, 10),
          // Senha criada pelo dono do sistema: o gerente cria a própria no primeiro acesso.
          mustChangePassword: true,
          role: "ADMIN",
          jobTitle: "Gerente do sistema",
          sector: "Administração",
        },
      });
      await tx.recordTemplate.createMany({ data: STARTER_TEMPLATES.map((t) => ({ ...t, clinicId: created.id })) });
      return created.id;
    });
  } catch (e) {
    if (duplicateSlug(e)) return { error: "Já existe uma clínica com este código. Escolha outro." };
    throw e;
  }

  await platformAudit({ userId: owner.id, action: "CLINICA_CRIADA", clinicId, details: { nome: clinic.name, codigo: clinic.slug } });
  revalidatePath("/painel");
  redirect(`/painel/clinicas/${clinicId}?criada=1`);
}

export async function updateClinic(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const owner = await requirePlatformUser();
  const before = await prisma.clinic.findUnique({ where: { id } });
  if (!before) return { error: "Clínica não encontrada." };
  const clinic = parseClinic(formData);
  const error = validateClinic(clinic);
  if (error) return { error };

  try {
    await prisma.clinic.update({ where: { id }, data: clinic });
  } catch (e) {
    if (duplicateSlug(e)) return { error: "Já existe uma clínica com este código. Escolha outro." };
    throw e;
  }
  const changed = (Object.keys(clinic) as (keyof typeof clinic)[]).filter((k) => (before[k] ?? null) !== clinic[k]);
  await platformAudit({ userId: owner.id, action: "CLINICA_ALTERADA", clinicId: id, details: { camposAlterados: changed } });
  revalidatePath("/painel", "layout");
  return { error: "", ok: "Dados da clínica salvos." };
}

// Suspender tira todos da clínica do sistema na hora (falta de pagamento, fim de contrato...).
// Nada é apagado: ao reativar, a clínica volta com todos os dados.
export async function suspendClinic(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const owner = await requirePlatformUser();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Informe o motivo da suspensão." };
  const clinic = await prisma.clinic.findUnique({ where: { id } });
  if (!clinic) return { error: "Clínica não encontrada." };
  if (!clinic.active) return { error: "Esta clínica já está suspensa." };

  await prisma.$transaction([
    prisma.clinic.update({ where: { id }, data: { active: false, suspendedAt: new Date(), suspendedReason: reason } }),
    prisma.session.deleteMany({ where: { user: { clinicId: id } } }),
    prisma.patientSession.deleteMany({ where: { patient: { clinicId: id } } }),
  ]);
  await platformAudit({ userId: owner.id, action: "CLINICA_SUSPENSA", clinicId: id, details: { motivo: reason } });
  revalidatePath("/painel", "layout");
  return { error: "", ok: "Acesso da clínica suspenso." };
}

export async function reactivateClinic(id: string) {
  const owner = await requirePlatformUser();
  await prisma.clinic.update({ where: { id }, data: { active: true, suspendedAt: null, suspendedReason: null } });
  await platformAudit({ userId: owner.id, action: "CLINICA_REATIVADA", clinicId: id });
  revalidatePath("/painel", "layout");
}
