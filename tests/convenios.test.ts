import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTussCode, normalizeAnsCode, normalizeCnes, normalizeTussCode, parseDays, parsePriceList } from "../src/lib/convenios";
import { claimNumberLabel, councilCode, defaultConsultationType, missingForClaim, normalizeCbo, ufCode } from "../src/lib/tiss";

test("códigos do convênio: ANS, CNES e TUSS", () => {
  assert.equal(normalizeAnsCode("005711"), "005711");
  assert.equal(normalizeAnsCode("00.571-1"), "005711");
  assert.equal(normalizeAnsCode("5711"), null);
  assert.equal(normalizeCnes("1234567"), "1234567");
  assert.equal(normalizeCnes("123456"), null);
  assert.equal(normalizeTussCode("1.01.01.01-2"), "10101012");
  assert.equal(normalizeTussCode("1010101"), null);
  assert.equal(formatTussCode("10101012"), "1.01.01.01-2");
});

test("prazos em dias", () => {
  assert.equal(parseDays(""), null);
  assert.equal(parseDays("30"), 30);
  assert.equal(parseDays("400"), undefined);
  assert.equal(parseDays("trinta"), undefined);
});

test("lista colada de procedimentos", () => {
  const { lines, errors } = parsePriceList(
    "10101012; Consulta em consultório; 150,00\n\n2.01.01.01-5\tEletrocardiograma\t45\n",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(lines, [
    { tussCode: "10101012", description: "Consulta em consultório", priceCents: 15000 },
    { tussCode: "20101015", description: "Eletrocardiograma", priceCents: 4500 },
  ]);
});

test("lista colada aponta as linhas com erro", () => {
  const { lines, errors } = parsePriceList(
    "123; Consulta; 150,00\n10101012; Consulta; abc\n10101012; Consulta; 100\n10101012; Repetida; 100\nsó texto",
  );
  assert.equal(lines.length, 1);
  assert.deepEqual(errors, [
    "Linha 1: o código TUSS precisa ter 8 números.",
    "Linha 2: valor inválido (ex.: 150,00).",
    "Linha 4: código 10101012 repetido na lista.",
    "Linha 5: separe código, descrição e valor com ponto e vírgula.",
  ]);
});

test("guia TISS: códigos de conselho, UF e o que falta no cadastro", () => {
  assert.equal(councilCode("CRM"), "06");
  assert.equal(councilCode("CRP"), "09");
  assert.equal(councilCode("CRBM"), "12");
  assert.equal(councilCode("CRAS"), "10");
  assert.equal(ufCode("GO"), "52");
  assert.equal(ufCode("SP"), "35");
  assert.equal(ufCode("XX"), null);
  assert.equal(normalizeCbo("2251-25"), "225125");
  assert.equal(normalizeCbo("2251"), null);
  assert.equal(defaultConsultationType("RETORNO"), 2);
  assert.equal(defaultConsultationType(undefined), 1);
  assert.equal(claimNumberLabel(42), "00000042");

  const ok = {
    clinic: { cnes: "1234567", cnpj: null },
    plan: { ansCode: "005711", providerCode: "998877" },
    professional: { councilType: "CRM", councilNumber: "12345", councilUf: "GO" },
  };
  assert.deepEqual(missingForClaim(ok), []);
  const faltando = missingForClaim({ ...ok, clinic: { cnes: null, cnpj: null }, plan: { ansCode: null, providerCode: null } });
  assert.equal(faltando.length, 3);
  assert.match(faltando.join(" "), /ANS/);
  assert.match(faltando.join(" "), /CNES/);
  assert.equal(missingForClaim({ ...ok, professional: { councilType: "CRM", councilNumber: "1", councilUf: null } }).length, 1);
});

test("conferência do pagamento: valor pago e motivo da glosa", async () => {
  const { parseMoney } = await import("../src/lib/money");
  const { parseClaimPayments } = await import("../src/lib/tiss");
  const claims = [
    { id: "a", number: 1, amountCents: 15000 },
    { id: "b", number: 2, amountCents: 15000 },
  ];
  const form = (values: Record<string, string>) => (key: string) => values[key] ?? null;
  const ok = parseClaimPayments(form({ pago_a: "150,00", pago_b: "100", glosa_b: "Valor acima da tabela" }), claims, parseMoney);
  assert.deepEqual(ok, {
    payments: [
      { id: "a", paidCents: 15000, glossReason: null },
      { id: "b", paidCents: 10000, glossReason: "Valor acima da tabela" },
    ],
  });
  const total = parseClaimPayments(form({ pago_a: "0", glosa_a: "Carteirinha vencida", pago_b: "150,00", glosa_b: "ignorado" }), claims, parseMoney);
  assert.deepEqual(total, {
    payments: [
      { id: "a", paidCents: 0, glossReason: "Carteirinha vencida" },
      { id: "b", paidCents: 15000, glossReason: null },
    ],
  });
  assert.match(JSON.stringify(parseClaimPayments(form({ pago_a: "100", pago_b: "150" }), claims, parseMoney)), /motivo da glosa/);
  assert.match(JSON.stringify(parseClaimPayments(form({ pago_a: "200", pago_b: "150" }), claims, parseMoney)), /maior que o valor/);
  assert.match(JSON.stringify(parseClaimPayments(form({ pago_a: "abc", pago_b: "150" }), claims, parseMoney)), /inválido/);
});

test("itens da guia SP/SADT: pula linha vazia, confere a tabela e multiplica pela quantidade", async () => {
  const { parseMoney } = await import("../src/lib/money");
  const { parseClaimItems } = await import("../src/lib/tiss");
  const prices = [{ tussCode: "40301630", description: "Hemograma" }, { tussCode: "40101010", description: "ECG" }];
  const form = (values: Record<string, string>) => (key: string) => values[key] ?? null;
  const ok = parseClaimItems(form({ item_tuss_0: "4.03.01.63-0", item_qtd_0: "2", item_valor_0: "40,00", item_tuss_2: "40101010", item_valor_2: "120" }), prices, parseMoney, normalizeTussCode);
  assert.deepEqual(ok, {
    items: [
      { sequence: 1, tussCode: "40301630", description: "Hemograma", quantity: 2, unitCents: 4000, totalCents: 8000 },
      { sequence: 2, tussCode: "40101010", description: "ECG", quantity: 1, unitCents: 12000, totalCents: 12000 },
    ],
  });
  assert.deepEqual(parseClaimItems(form({}), prices, parseMoney, normalizeTussCode), { error: "Inclua ao menos um exame ou procedimento." });
  assert.match((parseClaimItems(form({ item_tuss_0: "10101012", item_valor_0: "10" }), prices, parseMoney, normalizeTussCode) as { error: string }).error, /fora da tabela/);
  assert.match((parseClaimItems(form({ item_tuss_0: "40101010", item_qtd_0: "0", item_valor_0: "10" }), prices, parseMoney, normalizeTussCode) as { error: string }).error, /quantidade/);
});

test("recurso de glosa: valor glosado e valor recuperado", async () => {
  const { parseMoney } = await import("../src/lib/money");
  const { glossCents, parseRecovered } = await import("../src/lib/tiss");
  assert.equal(glossCents({ amountCents: 15000, paidCents: 12000 }), 3000);
  assert.equal(glossCents({ amountCents: 15000, paidCents: null }), 0);
  assert.deepEqual(parseRecovered("30,00", 3000, parseMoney), { cents: 3000 });
  assert.deepEqual(parseRecovered("", 3000, parseMoney), { cents: 0 });
  assert.match((parseRecovered("31", 3000, parseMoney) as { error: string }).error, /maior que o valor glosado/);
  assert.match((parseRecovered("abc", 3000, parseMoney) as { error: string }).error, /inválido/);
});
