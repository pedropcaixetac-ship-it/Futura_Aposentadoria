import { test } from "node:test";
import assert from "node:assert/strict";
import { chargeMessage, lastMonths, monthLabel, monthRange, paymentsCsv } from "../src/lib/painel-financeiro";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

test("meses do financeiro", () => {
  const r = monthRange("2026-12")!;
  assert.equal(r.start.toISOString().slice(0, 10), "2026-12-01");
  assert.equal(r.end.toISOString().slice(0, 10), "2027-01-01");
  assert.equal(monthRange("2026-13"), null);
  assert.equal(monthRange("abc"), null);
  assert.deepEqual(lastMonths("2027-02", 4), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.equal(monthLabel("2026-10"), "outubro de 2026");
  assert.equal(monthLabel("2026-10", true), "out/26");
});

test("mensagem de cobrança conforme a situação", () => {
  const base = { contactName: "Maria Souza", clinicName: "Clínica Sol", planName: "Essencial", priceCents: 14900, paidUntil: day("2026-10-25") };
  const late = chargeMessage({ ...base, status: { kind: "atrasada", daysLate: 6, daysToBlock: 5 }, pixKey: "pix@futura.com" });
  assert.match(late, /^Olá, Maria!/);
  assert.match(late, /venceu em 25\/10\/2026/);
  assert.match(late, /em até 5 dias/);
  assert.match(late, /Chave Pix: pix@futura\.com/);
  assert.match(late, /R\$\s?149,00/);

  const soon = chargeMessage({ ...base, contactName: null, status: { kind: "vence-logo", daysLeft: 3 } });
  assert.match(soon, /^Olá! Passando para lembrar/);
  assert.doesNotMatch(soon, /Pix/);

  const blocked = chargeMessage({ ...base, status: { kind: "bloqueada", daysLate: 12 } });
  assert.match(blocked, /está suspenso/);
});

test("planilha dos pagamentos abre no Excel em português", () => {
  const csv = paymentsCsv([
    { paidAt: day("2026-10-05"), clinicName: 'Clínica "Sol"; Centro', amountCents: 14900, method: "pix", paidUntil: day("2026-11-25"), registeredBy: "Pedro", notes: null, canceled: false },
    { paidAt: day("2026-10-06"), clinicName: "Lua", amountCents: 29900, method: "boleto", paidUntil: day("2026-11-06"), registeredBy: "Pedro", notes: "errado", canceled: true },
  ]);
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0], "Data;Clínica;Valor (R$);Forma;Pago até;Registrado por;Observação;Situação");
  assert.equal(lines[1], '05/10/2026;"Clínica ""Sol""; Centro";149,00;Pix;25/11/2026;Pedro;;Recebido');
  assert.equal(lines[2], "06/10/2026;Lua;299,00;Boleto;06/11/2026;Pedro;errado;Desfeito");
});
