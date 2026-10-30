import { test } from "node:test";
import assert from "node:assert/strict";
import { MESSAGES, canMessage, fillMessage, unknownFields, whatsappNumber, whatsappUrl } from "../src/lib/whatsapp";

test("telefone do cadastro vira número internacional do WhatsApp", () => {
  assert.equal(whatsappNumber("(11) 98888-1111"), "5511988881111");
  assert.equal(whatsappNumber("011 98888-1111"), "5511988881111");
  assert.equal(whatsappNumber("+55 62 3333-4444"), "556233334444");
  assert.equal(whatsappNumber("98888-1111"), null); // sem DDD
  assert.equal(whatsappNumber(""), null);
  assert.equal(whatsappNumber(null), null);
});

test("link do WhatsApp leva o texto pronto", () => {
  const link = whatsappUrl("(11) 98888-1111", "Olá, Maria!");
  assert.equal(link, "https://wa.me/5511988881111?text=Ol%C3%A1%2C%20Maria!");
  assert.equal(whatsappUrl("(11) 98888-1111", ""), "https://wa.me/5511988881111");
  assert.equal(whatsappUrl("123", "Oi"), null);
});

test("mensagem padrão de confirmação é preenchida com o primeiro nome, dia e hora", () => {
  const text = fillMessage(MESSAGES.confirmacao.text, {
    paciente: "Maria Oliveira",
    clinica: "Clínica Demo",
    profissional: "Dra. Ana",
    tipo: "consulta",
    dia: "31/10 (sexta)",
    hora: "14:00",
  });
  assert.equal(
    text,
    "Olá, Maria! Aqui é da Clínica Demo. Você tem consulta com Dra. Ana no dia 31/10 (sexta), às 14:00. " +
      "Você confirma sua presença? Se precisar remarcar, é só responder esta mensagem.",
  );
});

test("texto escrito pela clínica: colchetes conhecidos são trocados, os outros são apontados", () => {
  assert.equal(fillMessage("Oi [paciente], até [dia]!", { paciente: "João Pereira", dia: "amanhã" }), "Oi João, até amanhã!");
  assert.equal(fillMessage("Valor: [preco]", {}), "Valor: [preco]");
  assert.deepEqual(unknownFields("retorno", "[paciente] [hora] [hora] [clinica] [xyz]"), ["hora", "xyz"]);
  assert.deepEqual(unknownFields("confirmacao", MESSAGES.confirmacao.text), []);
});

test("botão só aparece com autorização e celular com WhatsApp", () => {
  const ok = { whatsappOptIn: true, phoneWhatsapp: true, phone: "62999990000" };
  assert.equal(canMessage(ok), true);
  assert.equal(canMessage({ ...ok, whatsappOptIn: false }), false);
  assert.equal(canMessage({ ...ok, phoneWhatsapp: false }), false);
  assert.equal(canMessage({ ...ok, phone: null }), false);
});
