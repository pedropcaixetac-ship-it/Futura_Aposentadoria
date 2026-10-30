import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseNfe } from "../src/lib/nfe";
import { parseQuantity, validatePurchase, type PurchaseInput } from "../src/lib/purchase";
import { purchaseExpenseDescription, splitInstallments } from "../src/lib/finance";

const xml = readFileSync(new URL("./fixtures/nfe-exemplo.xml", import.meta.url), "utf8");

test("lê o XML da nota fiscal eletrônica", () => {
  const nfe = parseNfe(xml);
  assert.ok(nfe);
  assert.equal(nfe.supplierName, "Farma & Cia Distribuidora Ltda");
  assert.equal(nfe.supplierCnpj, "11222333000181");
  assert.equal(nfe.invoiceNumber, "7890");
  assert.equal(nfe.invoiceSeries, "1");
  assert.equal(nfe.accessKey, "52261011222333000181550010000078901123456789");
  assert.equal(nfe.issueDate, "2026-10-28");
  // O total da nota inclui o frete.
  assert.equal(nfe.totalCents, 50000);
  assert.equal(nfe.items.length, 2);
  assert.deepEqual(nfe.items[0], {
    description: "Luva de procedimento M (caixa com 100)", unit: "CX", quantity: 10, unitPriceCents: 3250, totalCents: 32500, batch: "LV2026A", expiresAt: "2028-01-10",
  });
  // Lote e validade no formato antigo (<med>).
  assert.equal(nfe.items[1].batch, "SF889");
  assert.equal(nfe.items[1].expiresAt, "2027-06-30");
  assert.deepEqual(nfe.installments, [
    { dueDate: "2026-11-27", amountCents: 25000 },
    { dueDate: "2026-12-27", amountCents: 25000 },
  ]);
});

test("arquivo que não é NF-e é recusado", () => {
  assert.equal(parseNfe("<html><body>oi</body></html>"), null);
});

test("parcelas iguais a cada 30 dias, sobra de centavos na primeira", () => {
  const parcels = splitInstallments(10000, 3, new Date("2026-11-10T00:00:00Z"));
  assert.deepEqual(parcels.map((p) => p.amountCents), [3334, 3333, 3333]);
  assert.deepEqual(parcels.map((p) => p.dueDate.toISOString().slice(0, 10)), ["2026-11-10", "2026-12-10", "2027-01-09"]);
  assert.equal(purchaseExpenseDescription("7890", "Farma", 2, 3), "NF 7890 · Farma (2/3)");
  assert.equal(purchaseExpenseDescription("7890", "Farma", 1, 1), "NF 7890 · Farma");
});

test("quantidade aceita vírgula ou ponto", () => {
  assert.equal(parseQuantity("10"), 10);
  assert.equal(parseQuantity("2,5"), 2.5);
  assert.equal(parseQuantity("0.250"), 0.25);
  assert.equal(parseQuantity("0"), null);
  assert.equal(parseQuantity("abc"), null);
});

const base: PurchaseInput = {
  kind: "Medicamentos",
  supplierName: "Farma",
  supplierCnpj: "11.222.333/0001-81",
  invoiceNumber: "000123",
  invoiceSeries: "1",
  accessKey: "",
  issueDate: "2026-10-28",
  total: "500,00",
  notes: "",
  items: [
    { description: "Luva", unit: "CX", quantity: "10", unitPrice: "32,50", batch: "L1", expiresAt: "2028-01-10" },
    { description: "", unit: "", quantity: "", unitPrice: "", batch: "", expiresAt: "" },
  ],
  installments: [
    { dueDate: "2026-11-27", amount: "250,00" },
    { dueDate: "2026-12-27", amount: "250,00" },
  ],
};

test("nota válida: limpa CNPJ, tira zeros do número e ignora linha vazia", () => {
  const result = validatePurchase(base);
  assert.ok("data" in result);
  assert.equal(result.data.supplierCnpj, "11222333000181");
  assert.equal(result.data.invoiceNumber, "123");
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].totalCents, 32500);
  assert.equal(result.data.totalCents, 50000);
  assert.deepEqual(result.data.installments.map((p) => p.installment), [1, 2]);
});

test("avisos da nota fiscal", () => {
  const error = (patch: Partial<PurchaseInput>) => {
    const result = validatePurchase({ ...base, ...patch });
    return "error" in result ? result.error : "";
  };
  assert.match(error({ kind: "Qualquer" }), /tipo da compra/);
  assert.match(error({ supplierCnpj: "123" }), /CNPJ/);
  assert.match(error({ invoiceNumber: "" }), /número da nota/);
  assert.match(error({ accessKey: "123" }), /44 números/);
  assert.match(error({ total: "" }), /valor total/);
  assert.match(error({ installments: [{ dueDate: "2026-11-27", amount: "100,00" }] }), /soma das parcelas/);
  assert.match(error({ items: [{ description: "Luva", unit: "", quantity: "", unitPrice: "1,00", batch: "", expiresAt: "" }] }), /quantidade/);
});
