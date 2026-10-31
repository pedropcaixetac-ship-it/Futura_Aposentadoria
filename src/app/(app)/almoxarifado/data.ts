import { prisma } from "@/lib/db";

// Saldo de cada item do almoxarifado (soma das movimentações).
export async function loadSupplyStock(clinicId: string) {
  const [items, sums] = await Promise.all([
    prisma.supplyItem.findMany({ where: { clinicId }, orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }] }),
    prisma.supplyMovement.groupBy({ by: ["itemId"], where: { clinicId }, _sum: { quantity: true } }),
  ]);
  const balance = new Map(sums.map((s) => [s.itemId, s._sum.quantity ?? 0]));
  return items.map((item) => {
    const qty = balance.get(item.id) ?? 0;
    return { item, balance: qty, low: item.active && qty <= item.minStock };
  });
}
