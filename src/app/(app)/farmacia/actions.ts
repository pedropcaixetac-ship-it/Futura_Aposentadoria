"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAdjustPharmacyStock, canDispenseControlled } from "@/lib/hospital-roles";
import { audit } from "@/lib/audit";
import { withLock, type Tx } from "@/lib/lock";
import { isExpired, lotBalances, pickLots, UNITS } from "@/lib/farmacia";

export type FormState = { error: string; ok?: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

// Mesma entrega repetida dentro deste tempo é clique duplo.
const DOUBLE_CLICK_MS = 60_000;

function positiveInt(value: string | null) {
  const n = Number(value);
  return value !== null && Number.isInteger(n) && n > 0 && n <= 100_000 ? n : null;
}

async function lotsOf(tx: Tx, clinicId: string, productId: string) {
  const movements = await tx.stockMovement.findMany({ where: { clinicId, productId }, select: { lot: true, expiresAt: true, quantity: true } });
  return lotBalances(movements);
}

export async function saveProduct(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("farmacia");
  const name = text(formData, "name");
  if (!name) return { error: "Informe o nome do medicamento ou material." };
  const unit = text(formData, "unit") ?? "unidade";
  if (!UNITS.includes(unit)) return { error: "Escolha a unidade." };
  const minRaw = text(formData, "minStock");
  const minStock = minRaw === null ? 0 : Number(minRaw);
  if (!Number.isInteger(minStock) || minStock < 0) return { error: "O estoque mínimo é um número inteiro." };
  try {
    const product = await prisma.pharmacyProduct.create({
      data: { clinicId: user.clinicId, name, presentation: text(formData, "presentation"), unit, minStock, controlled: formData.get("controlled") === "on" },
    });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "FARMACIA_PRODUTO", entity: "PharmacyProduct", entityId: product.id, details: { produto: name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Este produto já está cadastrado." };
    throw e;
  }
  revalidatePath("/farmacia/estoque");
  return { error: "", ok: `${name} cadastrado.` };
}

// Entrada pela nota: lote e validade são obrigatórios para medicamento rastreável.
export async function receiveStock(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("farmacia");
  const product = await prisma.pharmacyProduct.findFirst({ where: { id: text(formData, "productId") ?? "", clinicId: user.clinicId, active: true } });
  if (!product) return { error: "Escolha o produto." };
  const lot = text(formData, "lot")?.toUpperCase();
  if (!lot) return { error: "Informe o lote." };
  const expiresRaw = text(formData, "expiresAt");
  const expiresAt = expiresRaw ? new Date(`${expiresRaw}T23:59:59-03:00`) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return { error: "Informe a validade." };
  if (isExpired(expiresAt)) return { error: "Este lote já está vencido. Não dê entrada." };
  const quantity = positiveInt(text(formData, "quantity"));
  if (!quantity) return { error: "Informe a quantidade." };

  const conflict = await withLock([`estoque:${product.id}`], async (tx) => {
    // O mesmo lote não pode chegar com outra validade.
    const other = await tx.stockMovement.findFirst({ where: { clinicId: user.clinicId, productId: product.id, lot, NOT: { expiresAt } }, select: { expiresAt: true } });
    if (other?.expiresAt) return `O lote ${lot} já está cadastrado com outra validade. Confira a nota.`;
    await tx.stockMovement.create({
      data: { clinicId: user.clinicId, productId: product.id, kind: "ENTRADA", quantity, lot, expiresAt, invoice: text(formData, "invoice"), note: text(formData, "note"), userId: user.id },
    });
    return null;
  });
  if (conflict) return { error: conflict };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "FARMACIA_ENTRADA", entity: "PharmacyProduct", entityId: product.id, details: { produto: product.name, lote: lot, quantidade: quantity } });
  revalidatePath("/farmacia");
  return { error: "", ok: `Entrada de ${quantity} ${product.unit}(s) de ${product.name}, lote ${lot}.` };
}

// Dispensação de um item prescrito: sai do lote que vence primeiro, nunca de lote vencido.
export async function dispense(itemId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("farmacia");
  const item = await prisma.prescriptionItem.findFirst({
    where: {
      id: itemId,
      clinicId: user.clinicId,
      kind: "MEDICAMENTO",
      suspendedAt: null,
      OR: [{ admission: { dischargedAt: null } }, { emergencyVisit: { closedAt: null } }],
    },
  });
  if (!item) return { error: "Item suspenso ou paciente já saiu." };
  const product = await prisma.pharmacyProduct.findFirst({ where: { id: text(formData, "productId") ?? "", clinicId: user.clinicId, active: true } });
  if (!product) return { error: "Escolha o produto do estoque." };
  if (product.controlled && !canDispenseControlled(user)) return { error: `${product.name} é controlado: só o farmacêutico (CRF) entrega.` };
  const quantity = positiveInt(text(formData, "quantity"));
  if (!quantity) return { error: "Informe a quantidade." };

  const result = await withLock([`estoque:${product.id}`, `dispensacao:${item.id}`], async (tx) => {
    // Clique duplo (ou dois farmacêuticos na mesma linha): a mesma entrega repetida em segundos sai uma vez só.
    const recent = await tx.stockMovement.findFirst({
      where: { clinicId: user.clinicId, prescriptionItemId: item.id, productId: product.id, kind: "DISPENSACAO", at: { gt: new Date(Date.now() - DOUBLE_CLICK_MS) } },
      select: { id: true },
    });
    if (recent) return { error: `${product.name} acabou de ser dispensado para este item. Se precisa mandar mais, aguarde um minuto e confira a quantidade.` };
    const { lots, missing } = pickLots(await lotsOf(tx, user.clinicId, product.id), quantity);
    if (missing > 0) return { error: `Estoque insuficiente de ${product.name}: faltam ${missing} ${product.unit}(s) (lotes vencidos não contam).` };
    for (const l of lots) {
      await tx.stockMovement.create({
        data: {
          clinicId: user.clinicId, productId: product.id, kind: "DISPENSACAO", quantity: -l.take, lot: l.lot, expiresAt: l.expiresAt,
          patientId: item.patientId, prescriptionItemId: item.id, userId: user.id,
        },
      });
    }
    return { error: "", ok: `Dispensado: ${quantity} ${product.unit}(s) de ${product.name} (lote ${lots.map((l) => l.lot).join(", ")}).` };
  });
  if (!result.error) {
    await audit({ clinicId: user.clinicId, userId: user.id, action: "FARMACIA_DISPENSACAO", entity: "PrescriptionItem", entityId: item.id, patientId: item.patientId, details: { produto: product.name, quantidade: quantity } });
    revalidatePath("/farmacia");
  }
  return result;
}

// Ajuste de inventário (contagem diferente) ou perda (vencido, quebrado). Sempre com o motivo.
export async function adjustStock(productId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("farmacia");
  if (!canAdjustPharmacyStock(user)) return { error: "Ajuste de estoque e perda são feitos pelo farmacêutico (CRF) ou pelo gerente." };
  const product = await prisma.pharmacyProduct.findFirst({ where: { id: productId, clinicId: user.clinicId } });
  if (!product) return { error: "Produto não encontrado." };
  const lot = text(formData, "lot");
  const kind = text(formData, "kind");
  const quantity = positiveInt(text(formData, "quantity"));
  const note = text(formData, "note");
  if (!lot) return { error: "Escolha o lote." };
  if (!quantity) return { error: "Informe a quantidade." };
  if (!note) return { error: "Informe o motivo." };
  const signed = kind === "AJUSTE_MAIS" ? quantity : -quantity;
  if (kind !== "AJUSTE_MAIS" && kind !== "AJUSTE_MENOS" && kind !== "PERDA") return { error: "Escolha o tipo." };

  const result = await withLock([`estoque:${product.id}`], async (tx) => {
    const movements = await tx.stockMovement.findMany({ where: { clinicId: user.clinicId, productId: product.id, lot }, select: { lot: true, expiresAt: true, quantity: true } });
    if (!movements.length) return { error: "Lote não encontrado." };
    const balance = movements.reduce((s, m) => s + m.quantity, 0);
    if (balance + signed < 0) return { error: `O lote ${lot} tem só ${balance} ${product.unit}(s).` };
    await tx.stockMovement.create({
      data: {
        clinicId: user.clinicId, productId: product.id, kind: kind === "PERDA" ? "PERDA" : "AJUSTE", quantity: signed, lot,
        expiresAt: movements.find((m) => m.expiresAt)?.expiresAt ?? null, note, userId: user.id,
      },
    });
    return { error: "", ok: "Estoque ajustado." };
  });
  if (!result.error) {
    await audit({ clinicId: user.clinicId, userId: user.id, action: "FARMACIA_AJUSTE", entity: "PharmacyProduct", entityId: product.id, details: { produto: product.name, lote: lot, quantidade: signed, motivo: note } });
    revalidatePath(`/farmacia/estoque/${product.id}`);
  }
  return result;
}
