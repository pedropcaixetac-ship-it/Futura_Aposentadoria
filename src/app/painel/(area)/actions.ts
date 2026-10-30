"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { platformAudit, requirePlatformUser } from "@/lib/painel-auth";
import { parseClinic, parseManager, STARTER_TEMPLATES, validateClinic, validateManager } from "@/lib/painel";
import { nextPaidUntil, sanitizeModules } from "@/lib/plans";
import { parseMoney } from "@/lib/money";

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
  const planId = String(formData.get("planId") ?? "") || null;
  if (planId && !(await prisma.plan.findUnique({ where: { id: planId } }))) return { error: "Plano não encontrado." };

  let clinicId: string;
  try {
    clinicId = await prisma.$transaction(async (tx) => {
      const created = await tx.clinic.create({ data: { ...clinic, planId } });
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

// ---- Planos e mensalidade ----

export async function savePlan(id: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const owner = await requirePlatformUser();
  const name = String(formData.get("name") ?? "").trim();
  const priceCents = parseMoney(String(formData.get("price") ?? ""));
  const maxRaw = String(formData.get("maxUsers") ?? "").trim();
  const maxUsers = maxRaw ? Number(maxRaw) : null;
  if (!name) return { error: "Dê um nome ao plano." };
  if (priceCents === null) return { error: "Informe a mensalidade (ex.: 199,90)." };
  if (maxUsers !== null && (!Number.isInteger(maxUsers) || maxUsers < 1)) return { error: "O limite de usuários precisa ser um número inteiro (ou vazio, para sem limite)." };
  const data = { name, priceCents, maxUsers, modules: sanitizeModules(formData.getAll("modules").map(String)), active: formData.get("active") === "on" };

  try {
    const plan = id ? await prisma.plan.update({ where: { id }, data }) : await prisma.plan.create({ data });
    await platformAudit({ userId: owner.id, action: id ? "PLANO_ALTERADO" : "PLANO_CRIADO", details: { plano: plan.name, mensalidade: priceCents, limite: maxUsers, modulos: data.modules } });
  } catch (e) {
    if (duplicateSlug(e)) return { error: "Já existe um plano com este nome." };
    throw e;
  }
  revalidatePath("/painel", "layout");
  return { error: "", ok: id ? "Plano salvo." : "Plano criado." };
}

function parseDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
}

// Plano da clínica e "pago até" (último dia coberto pela mensalidade). Vazio = sem controle de pagamento.
export async function setClinicPlan(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const owner = await requirePlatformUser();
  const planId = String(formData.get("planId") ?? "") || null;
  const paidRaw = String(formData.get("paidUntil") ?? "");
  const paidUntil = paidRaw ? parseDay(paidRaw) : null;
  if (paidRaw && !paidUntil) return { error: "Data de vencimento inválida." };
  if (planId && !(await prisma.plan.findUnique({ where: { id: planId } }))) return { error: "Plano não encontrado." };

  await prisma.clinic.update({ where: { id }, data: { planId, paidUntil } });
  await platformAudit({ userId: owner.id, action: "CLINICA_PLANO", clinicId: id, details: { planId, pagoAte: paidRaw || null } });
  revalidatePath("/painel", "layout");
  return { error: "", ok: "Plano e vencimento salvos." };
}

// Pagamento recebido por fora (Pix, boleto...): a mensalidade passa a valer por mais um mês.
export async function registerPayment(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const owner = await requirePlatformUser();
  const clinic = await prisma.clinic.findUnique({ where: { id }, include: { plan: true } });
  if (!clinic) return { error: "Clínica não encontrada." };
  const amountCents = parseMoney(String(formData.get("amount") ?? "")) ?? clinic.plan?.priceCents ?? null;
  const paidUntil = nextPaidUntil(clinic.paidUntil);

  await prisma.clinic.update({ where: { id }, data: { paidUntil } });
  await platformAudit({
    userId: owner.id,
    action: "PAGAMENTO_REGISTRADO",
    clinicId: id,
    details: { valor: amountCents, pagoAte: paidUntil.toISOString().slice(0, 10), antes: clinic.paidUntil?.toISOString().slice(0, 10) ?? null },
  });
  revalidatePath("/painel", "layout");
  return { error: "", ok: `Pagamento registrado. A mensalidade agora vale até ${paidUntil.toISOString().slice(0, 10).split("-").reverse().join("/")}.` };
}
