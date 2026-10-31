import { prisma } from "@/lib/db";
import { expiryState, isExpired, lotBalances, usableBalance, type Lot } from "@/lib/farmacia";

// Estoque de cada produto: lotes com saldo (na ordem de saída), saldo utilizável e alertas.
export async function loadStock(clinicId: string) {
  const [products, groups] = await Promise.all([
    prisma.pharmacyProduct.findMany({ where: { clinicId, active: true }, orderBy: { name: "asc" } }),
    prisma.stockMovement.groupBy({ by: ["productId", "lot", "expiresAt"], where: { clinicId }, _sum: { quantity: true } }),
  ]);
  const now = new Date();
  return products.map((product) => {
    const lots: Lot[] = lotBalances(
      groups.filter((g) => g.productId === product.id).map((g) => ({ lot: g.lot, expiresAt: g.expiresAt, quantity: g._sum.quantity ?? 0 })),
    );
    const usable = usableBalance(lots, now);
    const expired = lots.filter((l) => isExpired(l.expiresAt, now)).reduce((s, l) => s + l.balance, 0);
    const expiringSoon = lots.filter((l) => expiryState(l.expiresAt, now) === "VENCE_EM_BREVE");
    return { product, lots, usable, expired, expiringSoon, low: usable < product.minStock };
  });
}

export type StockRow = Awaited<ReturnType<typeof loadStock>>[number];
