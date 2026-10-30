import { test } from "node:test";
import assert from "node:assert/strict";
import { canCancelCharge, canManageCharges, canManageFinance, canViewCommission } from "../src/lib/permissions";
import { formatMoney, moneyInWords, parseMoney } from "../src/lib/money";
import { commission, monthRange } from "../src/lib/finance";

const medica = { id: "m1", role: "PROFISSIONAL" as const, councilNumber: "123" };
const recepcao = { id: "r1", role: "RECEPCAO" as const, councilNumber: null };
const admin = { id: "a1", role: "ADMIN" as const, councilNumber: null };

test("valores digitados viram centavos", () => {
  assert.equal(parseMoney("150"), 15000);
  assert.equal(parseMoney("150,5"), 15050);
  assert.equal(parseMoney("1.250,00"), 125000);
  assert.equal(parseMoney("R$ 1.250,99"), 125099);
  assert.equal(parseMoney("12.34"), null);
  assert.equal(parseMoney("abc"), null);
  assert.equal(formatMoney(125099).replace(/\s/g, " "), "R$ 1.250,99");
});

test("valor por extenso no recibo", () => {
  assert.equal(moneyInWords(15030), "cento e cinquenta reais e trinta centavos");
  assert.equal(moneyInWords(100), "um real");
  assert.equal(moneyInWords(110000), "mil e cem reais");
  assert.equal(moneyInWords(123456), "mil duzentos e trinta e quatro reais e cinquenta e seis centavos");
  assert.equal(moneyInWords(100000000), "um milhão de reais");
});

test("repasse é a porcentagem do recebido, arredondada ao centavo", () => {
  assert.equal(commission(25000, 60), 15000);
  assert.equal(commission(33333, 50), 16667);
  assert.equal(commission(25000, null), 0);
});

test("mês do financeiro", () => {
  const r = monthRange("2026-12");
  assert.equal(r.start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(r.end.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(r.prev, "2026-11");
  assert.equal(r.next, "2027-01");
  assert.equal(r.label, "Dezembro de 2026");
});

test("quem pode fazer o quê no financeiro", () => {
  assert.equal(canManageCharges(recepcao), true);
  assert.equal(canManageCharges(medica), false);
  assert.equal(canManageFinance(admin), true);
  assert.equal(canManageFinance(recepcao), false);
  assert.equal(canManageFinance({ id: "ad1", role: "ADMINISTRATIVO" as const, councilNumber: null }), true);
  // A recepção cancela cobrança pendente, mas só o administrador cancela uma já paga.
  assert.equal(canCancelCharge(recepcao, { status: "PENDENTE" }), true);
  assert.equal(canCancelCharge(recepcao, { status: "PAGO" }), false);
  assert.equal(canCancelCharge(admin, { status: "PAGO" }), true);
  // Cada profissional vê só o próprio repasse.
  assert.equal(canViewCommission(medica, "m1"), true);
  assert.equal(canViewCommission(medica, "m2"), false);
});
