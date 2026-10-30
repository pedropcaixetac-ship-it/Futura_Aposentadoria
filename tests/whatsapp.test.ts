import { test } from "node:test";
import assert from "node:assert/strict";
import { whatsappLink, whatsappNumber } from "../src/lib/whatsapp";

test("telefone do cadastro vira número internacional do WhatsApp", () => {
  assert.equal(whatsappNumber("(11) 98888-1111"), "5511988881111");
  assert.equal(whatsappNumber("011 98888-1111"), "5511988881111");
  assert.equal(whatsappNumber("+55 62 3333-4444"), "556233334444");
  assert.equal(whatsappNumber("98888-1111"), null); // sem DDD
  assert.equal(whatsappNumber(""), null);
  assert.equal(whatsappNumber(null), null);
});

test("link do WhatsApp leva o texto pronto com o primeiro nome", () => {
  const link = whatsappLink("(11) 98888-1111", "retorno", { patient: "Maria Oliveira", clinic: "Clínica Demo" });
  assert.ok(link?.startsWith("https://wa.me/5511988881111?text="));
  const text = decodeURIComponent(link!.split("text=")[1]);
  assert.match(text, /^Olá, Maria! Aqui é da Clínica Demo\./);
  assert.doesNotMatch(text, /Oliveira/);
  assert.equal(whatsappLink("(11) 98888-1111", "livre", { patient: "Maria", clinic: "X" }), "https://wa.me/5511988881111");
  assert.equal(whatsappLink("123", "contato", { patient: "Maria", clinic: "X" }), null);
});
