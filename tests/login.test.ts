import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesCouncil, parseLoginId } from "../src/lib/login";

test("reconhece e-mail, CPF e número do conselho", () => {
  assert.deepEqual(parseLoginId(" Ana@Demo.com "), { kind: "email", email: "ana@demo.com" });
  assert.deepEqual(parseLoginId("529.982.247-25"), { kind: "cpf", cpf: "52998224725" });
  assert.deepEqual(parseLoginId("CRM 123456/SP"), { kind: "council", number: "123456", letters: ["CRM", "SP"] });
  assert.equal(parseLoginId(""), null);
  assert.equal(parseLoginId("abc"), null);
});

test("CPF com dígito errado não é tratado como CPF", () => {
  assert.equal(parseLoginId("529.982.247-26")?.kind, "council");
});

test("confere o número do conselho com e sem letras", () => {
  const ana = { councilType: "CRM", councilNumber: "123456", councilUf: "SP" };
  const carlos = { councilType: "CRP", councilNumber: "06/98765", councilUf: "SP" };
  const id = (s: string) => parseLoginId(s) as { number: string; letters: string[] };

  assert.ok(matchesCouncil(ana, id("123456")));
  assert.ok(matchesCouncil(ana, id("CRM-SP 123456")));
  assert.ok(matchesCouncil(ana, id("0123456")));
  assert.ok(!matchesCouncil(ana, id("CRP 123456")));
  assert.ok(!matchesCouncil(ana, id("123456/GO")));
  assert.ok(!matchesCouncil(ana, id("12345")));

  assert.ok(matchesCouncil(carlos, id("06/98765")));
  assert.ok(matchesCouncil(carlos, id("98765")));
  assert.ok(matchesCouncil(carlos, id("CRP 98765")));
  assert.ok(!matchesCouncil({ councilType: null, councilNumber: null, councilUf: null }, id("98765")));
});
