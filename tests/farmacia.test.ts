// Versão hospitalar: farmácia (estoque por lote e validade). A parte do banco precisa dele rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { expiryState, lotBalances, pickLots, usableBalance } from "../src/lib/farmacia";
import { tabInInstitution } from "../src/lib/tabs";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

const now = new Date("2026-10-31T12:00:00Z");
const day = 24 * 3600_000;
const inDays = (n: number) => new Date(now.getTime() + n * day);

test("saldo por lote: vence primeiro, sai primeiro; lote zerado some", () => {
  const lots = lotBalances([
    { lot: "B", expiresAt: inDays(200), quantity: 10 },
    { lot: "A", expiresAt: inDays(20), quantity: 5 },
    { lot: "C", expiresAt: inDays(100), quantity: 3 },
    { lot: "C", expiresAt: inDays(100), quantity: -3 },
    { lot: "A", expiresAt: inDays(20), quantity: -1 },
  ]);
  assert.deepEqual(lots.map((l) => [l.lot, l.balance]), [["A", 4], ["B", 10]]);
});

test("dispensação nunca usa lote vencido e avisa o que falta", () => {
  const lots = lotBalances([
    { lot: "VENCIDO", expiresAt: inDays(-2), quantity: 50 },
    { lot: "A", expiresAt: inDays(10), quantity: 3 },
    { lot: "B", expiresAt: inDays(300), quantity: 4 },
  ]);
  assert.deepEqual(pickLots(lots, 5, now), { lots: [{ lot: "A", expiresAt: inDays(10), take: 3 }, { lot: "B", expiresAt: inDays(300), take: 2 }], missing: 0 });
  assert.equal(pickLots(lots, 9, now).missing, 2);
  assert.equal(usableBalance(lots, now), 7);
});

test("validade: vencido, vence em 30 dias, ok", () => {
  assert.equal(expiryState(inDays(-1), now), "VENCIDO");
  assert.equal(expiryState(inDays(29), now), "VENCE_EM_BREVE");
  assert.equal(expiryState(inDays(31), now), "OK");
  assert.equal(expiryState(null, now), "OK");
});

test("a aba Farmácia só aparece no hospital", () => {
  assert.equal(tabInInstitution("HOSPITAL", "farmacia"), true);
  assert.equal(tabInInstitution("CLINICA", "farmacia"), false);
});

async function hospital(label: string) {
  const slug = `farm-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: `Hospital ${label}`, slug, kind: "HOSPITAL" } });
  const user = await prisma.user.create({ data: { clinicId: clinic.id, name: "Farmacêutica", email: `${slug}@t.com`, passwordHash: "-", role: "PROFISSIONAL" } });
  const product = await prisma.pharmacyProduct.create({ data: { clinicId: clinic.id, name: "Dipirona", presentation: "ampola" } });
  return { clinic, user, product };
}

test("movimentação de estoque: sinal certo e nada se altera nem se apaga", async () => {
  const h = await hospital("a");
  const base = { clinicId: h.clinic.id, productId: h.product.id, lot: "L1", userId: h.user.id };
  await assert.rejects(prisma.stockMovement.create({ data: { ...base, kind: "ENTRADA", quantity: -5 } }), /sinal/);
  await assert.rejects(prisma.stockMovement.create({ data: { ...base, kind: "DISPENSACAO", quantity: 5 } }), /sinal/);
  const entry = await prisma.stockMovement.create({ data: { ...base, kind: "ENTRADA", quantity: 5 } });
  await assert.rejects(prisma.stockMovement.update({ where: { id: entry.id }, data: { quantity: 50 } }), /não podem ser alterados/);
  await assert.rejects(prisma.stockMovement.delete({ where: { id: entry.id } }), /não podem ser alterados/);
});

test("estoque não aceita produto ou paciente de outra instituição", async () => {
  const a = await hospital("b");
  const b = await hospital("c");
  await assert.rejects(
    prisma.stockMovement.create({ data: { clinicId: a.clinic.id, productId: b.product.id, kind: "ENTRADA", quantity: 1, lot: "X", userId: a.user.id } }),
    /outra clínica/,
  );
});
