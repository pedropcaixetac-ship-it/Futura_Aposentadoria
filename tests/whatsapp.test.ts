import { test } from "node:test";
import assert from "node:assert/strict";
import { canMessage, confirmationLink, returnLink, whatsappLink, whatsappNumber } from "../src/lib/whatsapp";

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

test("confirmação da consulta leva dia, hora e profissional, sem dados clínicos", () => {
  const link = confirmationLink("(62) 99999-0000", {
    patient: "Maria Oliveira",
    clinic: "Clínica Demo",
    professional: "Dra. Ana",
    type: "consulta",
    day: "31/10 (sexta)",
    time: "14:00",
  });
  const text = decodeURIComponent(link!.split("text=")[1]);
  assert.equal(
    text,
    "Olá, Maria! Aqui é da Clínica Demo. Você tem consulta com Dra. Ana no dia 31/10 (sexta), às 14:00. " +
      "Você confirma sua presença? Se precisar remarcar, é só responder esta mensagem.",
  );
  assert.match(decodeURIComponent(returnLink("62999990000", { patient: "João", clinic: "X", professional: "Dr. Carlos" })!), /retorno com Dr\. Carlos/);
});

test("botão só aparece com autorização e celular com WhatsApp", () => {
  const ok = { whatsappOptIn: true, phoneWhatsapp: true, phone: "62999990000" };
  assert.equal(canMessage(ok), true);
  assert.equal(canMessage({ ...ok, whatsappOptIn: false }), false);
  assert.equal(canMessage({ ...ok, phoneWhatsapp: false }), false);
  assert.equal(canMessage({ ...ok, phone: null }), false);
});
