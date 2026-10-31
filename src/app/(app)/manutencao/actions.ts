"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { withLock, type Tx } from "@/lib/lock";
import { HOSPITAL_SECTORS } from "@/lib/almoxarifado";
import { WORK_CATEGORIES } from "@/lib/manutencao";

export type FormState = { error: string; ok?: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

async function nextNumber(tx: Tx, clinicId: string) {
  const last = await tx.workOrder.findFirst({ where: { clinicId }, orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

function refresh() {
  revalidatePath("/manutencao");
  revalidatePath("/manutencao/equipamentos");
  revalidatePath("/chamados");
}

export async function saveEquipment(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("manutencao");
  const name = text(formData, "name");
  const tag = text(formData, "tag")?.toUpperCase();
  if (!name || !tag) return { error: "Informe o nome e o número de patrimônio." };
  const location = text(formData, "location") ?? "";
  if (!HOSPITAL_SECTORS.includes(location)) return { error: "Escolha o setor onde o equipamento fica." };
  const daysRaw = text(formData, "preventiveDays");
  const preventiveDays = daysRaw === null ? null : Number(daysRaw);
  if (preventiveDays !== null && (!Number.isInteger(preventiveDays) || preventiveDays < 1 || preventiveDays > 3650)) return { error: "A preventiva é a cada quantos dias (1 a 3650)." };
  const lastRaw = text(formData, "lastPreventiveAt");
  const lastPreventiveAt = lastRaw ? new Date(`${lastRaw}T12:00:00-03:00`) : null;
  if (lastPreventiveAt && (Number.isNaN(lastPreventiveAt.getTime()) || lastPreventiveAt > new Date())) return { error: "A data da última preventiva não pode ser no futuro." };
  try {
    const equipment = await prisma.equipment.create({
      data: { clinicId: user.clinicId, name, tag, location, brandModel: text(formData, "brandModel"), serial: text(formData, "serial"), preventiveDays, lastPreventiveAt },
    });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "EQUIPAMENTO_SALVO", entity: "Equipment", entityId: equipment.id, details: { equipamento: name, patrimonio: tag } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: `O patrimônio ${tag} já está cadastrado.` };
    throw e;
  }
  refresh();
  return { error: "", ok: `${name} (${tag}) cadastrado.` };
}

export async function setEquipmentActive(equipmentId: string, active: boolean) {
  const user = await requireUser("manutencao");
  const equipment = await prisma.equipment.findFirst({ where: { id: equipmentId, clinicId: user.clinicId } });
  if (!equipment) return;
  await prisma.equipment.update({ where: { id: equipment.id }, data: { active } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "EQUIPAMENTO_SALVO", entity: "Equipment", entityId: equipment.id, details: { equipamento: equipment.name, ativo: active } });
  refresh();
}

// Qualquer setor abre chamado (aba Pedidos e chamados).
export async function openWorkOrder(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("chamados");
  const category = text(formData, "category") ?? "";
  if (!WORK_CATEGORIES.includes(category)) return { error: "Escolha o tipo do problema." };
  const location = text(formData, "location") ?? "";
  if (!HOSPITAL_SECTORS.includes(location)) return { error: "Escolha o setor." };
  const description = text(formData, "description");
  if (!description) return { error: "Descreva o problema." };
  const equipmentId = text(formData, "equipmentId");
  const equipment = equipmentId ? await prisma.equipment.findFirst({ where: { id: equipmentId, clinicId: user.clinicId, active: true } }) : null;
  if (equipmentId && !equipment) return { error: "Equipamento não encontrado." };
  const number = await withLock([`chamado:${user.clinicId}`], async (tx) => {
    const n = await nextNumber(tx, user.clinicId);
    await tx.workOrder.create({
      data: {
        clinicId: user.clinicId,
        number: n,
        category,
        location,
        equipmentId: equipment?.id ?? null,
        description,
        urgent: formData.get("urgent") === "on",
        stopped: !!equipment && formData.get("stopped") === "on",
        openedById: user.id,
      },
    });
    return n;
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CHAMADO_ABERTO", entity: "WorkOrder", details: { numero: number, setor: location, tipo: category } });
  refresh();
  return { error: "", ok: `Chamado nº ${number} aberto. A manutenção já vê na fila.` };
}

// Preventiva vencida ou perto de vencer: a manutenção abre o chamado com um clique.
export async function openPreventive(equipmentId: string) {
  const user = await requireUser("manutencao");
  const equipment = await prisma.equipment.findFirst({ where: { id: equipmentId, clinicId: user.clinicId, active: true } });
  if (!equipment) return;
  const number = await withLock([`chamado:${user.clinicId}`], async (tx) => {
    const open = await tx.workOrder.findFirst({ where: { clinicId: user.clinicId, equipmentId: equipment.id, kind: "PREVENTIVA", status: { in: ["ABERTO", "EM_ANDAMENTO"] } } });
    if (open) return null;
    const n = await nextNumber(tx, user.clinicId);
    await tx.workOrder.create({
      data: {
        clinicId: user.clinicId,
        number: n,
        kind: "PREVENTIVA",
        category: "Equipamento médico",
        location: equipment.location,
        equipmentId: equipment.id,
        description: `Manutenção preventiva de ${equipment.name} (${equipment.tag})`,
        openedById: user.id,
      },
    });
    return n;
  });
  if (number) await audit({ clinicId: user.clinicId, userId: user.id, action: "CHAMADO_ABERTO", entity: "WorkOrder", details: { numero: number, preventiva: equipment.tag } });
  refresh();
}

export async function startWorkOrder(workOrderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("manutencao");
  const assignedTo = text(formData, "assignedTo");
  if (!assignedTo) return { error: "Informe quem vai atender (técnico ou empresa)." };
  const order = await prisma.workOrder.findFirst({ where: { id: workOrderId, clinicId: user.clinicId } });
  if (!order) return { error: "Chamado não encontrado." };
  if (order.status !== "ABERTO") return { error: "Este chamado já foi iniciado ou encerrado." };
  const { count } = await prisma.workOrder.updateMany({ where: { id: order.id, clinicId: user.clinicId, status: "ABERTO" }, data: { status: "EM_ANDAMENTO", startedAt: new Date(), assignedTo } });
  if (!count) return { error: "Este chamado já foi iniciado ou encerrado." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CHAMADO_INICIADO", entity: "WorkOrder", entityId: order.id, details: { numero: order.number, responsavel: assignedTo } });
  refresh();
  return { error: "", ok: `Chamado nº ${order.number} em andamento.` };
}

// Concluir: diz o que foi feito. Preventiva concluída zera a contagem do equipamento.
export async function closeWorkOrder(workOrderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("manutencao");
  const solution = text(formData, "solution");
  if (!solution) return { error: "Escreva o que foi feito." };
  const result = await withLock([`chamado-item:${workOrderId}`], async (tx) => {
    const order = await tx.workOrder.findFirst({ where: { id: workOrderId, clinicId: user.clinicId } });
    if (!order) return "Chamado não encontrado.";
    if (order.status === "CONCLUIDO" || order.status === "CANCELADO") return "Este chamado já foi encerrado.";
    const now = new Date();
    const { count } = await tx.workOrder.updateMany({
      where: { id: order.id, clinicId: user.clinicId, status: { in: ["ABERTO", "EM_ANDAMENTO"] } },
      data: { status: "CONCLUIDO", closedAt: now, closedById: user.id, solution, startedAt: order.startedAt ?? now, stopped: false },
    });
    if (!count) return "Este chamado já foi encerrado.";
    if (order.kind === "PREVENTIVA" && order.equipmentId) {
      await tx.equipment.update({ where: { id: order.equipmentId }, data: { lastPreventiveAt: now } });
    }
    return order.number;
  });
  if (typeof result === "string") return { error: result };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CHAMADO_CONCLUIDO", entity: "WorkOrder", entityId: workOrderId, details: { numero: result } });
  refresh();
  return { error: "", ok: `Chamado nº ${result} concluído.` };
}

export async function cancelWorkOrder(workOrderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("manutencao");
  const reason = text(formData, "reason");
  if (!reason) return { error: "Informe o motivo." };
  const order = await prisma.workOrder.findFirst({ where: { id: workOrderId, clinicId: user.clinicId } });
  if (!order) return { error: "Chamado não encontrado." };
  if (order.status === "CONCLUIDO" || order.status === "CANCELADO") return { error: "Este chamado já foi encerrado." };
  const { count } = await prisma.workOrder.updateMany({
    where: { id: order.id, clinicId: user.clinicId, status: { in: ["ABERTO", "EM_ANDAMENTO"] } },
    data: { status: "CANCELADO", closedAt: new Date(), closedById: user.id, solution: `Cancelado: ${reason}`, stopped: false },
  });
  if (!count) return { error: "Este chamado já foi encerrado." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CHAMADO_CANCELADO", entity: "WorkOrder", entityId: order.id, details: { numero: order.number, motivo: reason } });
  refresh();
  return { error: "", ok: `Chamado nº ${order.number} cancelado.` };
}
