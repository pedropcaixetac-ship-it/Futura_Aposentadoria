"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { withLock, type Tx } from "@/lib/lock";
import { hasTab } from "@/lib/tabs";
import { deliverable, HOSPITAL_SECTORS, parseRequestLines, SUPPLY_CATEGORIES, SUPPLY_UNITS, supplyBalance } from "@/lib/almoxarifado";

export type FormState = { error: string; ok?: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function positiveInt(value: string | null) {
  const n = Number(value);
  return value !== null && Number.isInteger(n) && n > 0 && n <= 100_000 ? n : null;
}

async function balanceOf(tx: Tx, clinicId: string, itemId: string) {
  const movements = await tx.supplyMovement.findMany({ where: { clinicId, itemId }, select: { quantity: true } });
  return supplyBalance(movements);
}

export async function saveSupplyItem(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("almoxarifado");
  const name = text(formData, "name");
  if (!name) return { error: "Informe o nome do item." };
  const category = text(formData, "category") ?? "";
  if (!SUPPLY_CATEGORIES.includes(category)) return { error: "Escolha a categoria." };
  const unit = text(formData, "unit") ?? "unidade";
  if (!SUPPLY_UNITS.includes(unit)) return { error: "Escolha a unidade." };
  const minRaw = text(formData, "minStock");
  const minStock = minRaw === null ? 0 : Number(minRaw);
  if (!Number.isInteger(minStock) || minStock < 0) return { error: "O estoque mínimo é um número inteiro." };
  try {
    const item = await prisma.supplyItem.create({ data: { clinicId: user.clinicId, name, category, unit, minStock } });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "ALMOX_ITEM", entity: "SupplyItem", entityId: item.id, details: { item: name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Este item já está cadastrado." };
    throw e;
  }
  revalidatePath("/almoxarifado");
  return { error: "", ok: `${name} cadastrado.` };
}

export async function receiveSupply(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("almoxarifado");
  const item = await prisma.supplyItem.findFirst({ where: { id: text(formData, "itemId") ?? "", clinicId: user.clinicId, active: true } });
  if (!item) return { error: "Escolha o item." };
  const quantity = positiveInt(text(formData, "quantity"));
  if (!quantity) return { error: "Informe a quantidade." };
  await prisma.supplyMovement.create({
    data: { clinicId: user.clinicId, itemId: item.id, kind: "ENTRADA", quantity, invoice: text(formData, "invoice"), note: text(formData, "note"), userId: user.id },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ALMOX_ENTRADA", entity: "SupplyItem", entityId: item.id, details: { item: item.name, quantidade: quantity } });
  revalidatePath("/almoxarifado");
  return { error: "", ok: `Entrada de ${quantity} ${item.unit}(s) de ${item.name}.` };
}

// Contagem que não bate ou perda: nunca deixa o saldo negativo.
export async function adjustSupply(itemId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("almoxarifado");
  const item = await prisma.supplyItem.findFirst({ where: { id: itemId, clinicId: user.clinicId } });
  if (!item) return { error: "Item não encontrado." };
  const kind = text(formData, "kind");
  if (kind !== "PERDA" && kind !== "AJUSTE_MAIS" && kind !== "AJUSTE_MENOS") return { error: "Escolha o tipo." };
  const quantity = positiveInt(text(formData, "quantity"));
  if (!quantity) return { error: "Informe a quantidade." };
  const note = text(formData, "note");
  if (!note) return { error: "Informe o motivo." };
  const delta = kind === "AJUSTE_MAIS" ? quantity : -quantity;
  const error = await withLock([`almox:${item.id}`], async (tx) => {
    if (delta < 0 && (await balanceOf(tx, user.clinicId, item.id)) < quantity) return "O saldo não tem essa quantidade.";
    await tx.supplyMovement.create({
      data: { clinicId: user.clinicId, itemId: item.id, kind: kind === "PERDA" ? "PERDA" : "AJUSTE", quantity: delta, note, userId: user.id },
    });
    return null;
  });
  if (error) return { error };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ALMOX_AJUSTE", entity: "SupplyItem", entityId: item.id, details: { item: item.name, quantidade: delta, motivo: note } });
  revalidatePath(`/almoxarifado/${item.id}`);
  return { error: "", ok: "Registrado." };
}

// Qualquer setor pede material (aba Pedidos e chamados).
export async function requestSupplies(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("chamados");
  const sector = text(formData, "sector") ?? "";
  if (!HOSPITAL_SECTORS.includes(sector)) return { error: "Escolha o setor." };
  const entries = [...Array(8).keys()].map((i) => ({ itemId: String(formData.get(`item${i}`) ?? ""), quantity: String(formData.get(`quantidade${i}`) ?? "") }));
  const lines = parseRequestLines(entries);
  if (typeof lines === "string") return { error: lines };
  const items = await prisma.supplyItem.findMany({ where: { clinicId: user.clinicId, active: true, id: { in: lines.map((l) => l.itemId) } }, select: { id: true } });
  if (items.length !== lines.length) return { error: "Algum item não existe mais. Recarregue a página." };
  const request = await prisma.supplyRequest.create({
    data: {
      clinicId: user.clinicId,
      sector,
      note: text(formData, "note"),
      requestedById: user.id,
      lines: { create: lines.map((l) => ({ clinicId: user.clinicId, itemId: l.itemId, quantity: l.quantity })) },
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ALMOX_PEDIDO", entity: "SupplyRequest", entityId: request.id, details: { setor: sector, itens: lines.length } });
  revalidatePath("/chamados");
  revalidatePath("/almoxarifado");
  return { error: "", ok: `Pedido enviado ao almoxarifado (${lines.length} item(ns)).` };
}

// Entrega do pedido: cada item sai do estoque na quantidade entregue (nunca mais que o saldo).
export async function deliverRequest(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("almoxarifado");
  const request = await prisma.supplyRequest.findFirst({ where: { id: requestId, clinicId: user.clinicId }, include: { lines: { include: { item: true } } } });
  if (!request) return { error: "Pedido não encontrado." };
  const amounts = new Map<string, number>();
  for (const line of request.lines) {
    const raw = text(formData, `entregue_${line.id}`);
    const n = raw === null ? 0 : Number(raw);
    if (!Number.isInteger(n) || n < 0) return { error: `Quantidade entregue inválida em ${line.item.name}.` };
    if (n > line.quantity) return { error: `${line.item.name}: não entregue mais do que foi pedido.` };
    amounts.set(line.id, n);
  }
  if ([...amounts.values()].every((n) => n === 0)) return { error: "Nada para entregar. Se não há nenhum item, cancele o pedido." };

  const error = await withLock([`almox-pedido:${request.id}`, ...request.lines.map((l) => `almox:${l.itemId}`)], async (tx) => {
    const fresh = await tx.supplyRequest.findFirst({ where: { id: request.id, clinicId: user.clinicId }, select: { status: true } });
    if (fresh?.status !== "ABERTA") return "Este pedido já foi entregue ou cancelado.";
    for (const line of request.lines) {
      const n = amounts.get(line.id)!;
      const balance = await balanceOf(tx, user.clinicId, line.itemId);
      if (deliverable(n, balance) < n) return `${line.item.name}: só há ${balance} no estoque.`;
      await tx.supplyRequestLine.update({ where: { id: line.id }, data: { delivered: n } });
      if (n > 0) {
        await tx.supplyMovement.create({
          data: { clinicId: user.clinicId, itemId: line.itemId, kind: "SAIDA", quantity: -n, sector: request.sector, requestId: request.id, userId: user.id },
        });
      }
    }
    await tx.supplyRequest.update({
      where: { id: request.id },
      data: { status: "ATENDIDA", handledAt: new Date(), handledById: user.id, handledNote: text(formData, "handledNote") },
    });
    return null;
  });
  if (error) return { error };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ALMOX_ENTREGA", entity: "SupplyRequest", entityId: request.id, details: { setor: request.sector } });
  revalidatePath("/almoxarifado");
  revalidatePath("/chamados");
  return { error: "", ok: `Pedido de ${request.sector} entregue.` };
}

// O almoxarifado cancela com motivo; quem pediu também pode desistir enquanto não foi entregue.
export async function cancelRequest(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const request = await prisma.supplyRequest.findFirst({ where: { id: requestId, clinicId: user.clinicId } });
  if (!request) return { error: "Pedido não encontrado." };
  if (!hasTab(user, "almoxarifado") && request.requestedById !== user.id) return { error: "Só quem pediu ou o almoxarifado pode cancelar." };
  const reason = text(formData, "reason");
  if (!reason) return { error: "Informe o motivo." };
  const done = await withLock([`almox-pedido:${request.id}`], async (tx) => {
    const fresh = await tx.supplyRequest.findFirst({ where: { id: request.id, clinicId: user.clinicId }, select: { status: true } });
    if (fresh?.status !== "ABERTA") return false;
    await tx.supplyRequest.update({ where: { id: request.id }, data: { status: "CANCELADA", handledAt: new Date(), handledById: user.id, handledNote: reason } });
    return true;
  });
  if (!done) return { error: "Este pedido já foi entregue ou cancelado." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ALMOX_PEDIDO_CANCELADO", entity: "SupplyRequest", entityId: request.id, details: { motivo: reason } });
  revalidatePath("/almoxarifado");
  revalidatePath("/chamados");
  return { error: "", ok: "Pedido cancelado." };
}
