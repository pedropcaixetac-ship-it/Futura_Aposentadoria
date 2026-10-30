import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTussCode, normalizeAnsCode, normalizeCnes, normalizeTussCode, parseDays, parsePriceList } from "../src/lib/convenios";

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
