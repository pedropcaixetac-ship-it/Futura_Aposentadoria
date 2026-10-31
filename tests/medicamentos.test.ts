// Busca de medicamento enquanto o médico digita (prescrição do hospital e receita da clínica).
import { test } from "node:test";
import assert from "node:assert/strict";
import { addToPrescription, searchMedications } from "../src/lib/medicamentos";

test("acha pelo começo do nome, sem ligar para acento ou maiúscula", () => {
  const r = searchMedications("dipi");
  assert.ok(r.slice(0, 3).every((m) => m.name === "Dipirona"));
  assert.equal(searchMedications("acido tran")[0].name, "Ácido tranexâmico");
});

test("aceita nome e dose juntos", () => {
  assert.match(searchMedications("amox 875")[0].presentation, /875/);
});

test("acha por palavra do meio do nome", () => {
  assert.ok(searchMedications("clavul").some((m) => m.name === "Amoxicilina + clavulanato"));
});

test("menos de 2 letras não busca", () => {
  assert.deepEqual(searchMedications("d"), []);
});

test("o que a farmácia tem aparece primeiro e marcado", () => {
  const r = searchMedications("dipirona", [{ name: "Dipirona", presentation: "1 g/2 mL ampola", route: "" }]);
  assert.equal(r[0].presentation, "1 g/2 mL ampola");
  assert.equal(r[0].inPharmacy, true);
  // a via vem da lista comum quando a farmácia não informa
  assert.equal(searchMedications("ceftri", [{ name: "Ceftriaxona", presentation: "1 g frasco-ampola", route: "" }])[0].route, "Endovenosa (EV)");
});

test("receita da clínica: preenche o primeiro item vazio e depois cria os seguintes", () => {
  const amox = { name: "Amoxicilina", presentation: "500 mg cápsula" };
  const dipi = { name: "Dipirona", presentation: "500 mg comprimido" };
  let body = addToPrescription("Uso oral\n\n1. ", amox);
  assert.equal(body, "Uso oral\n\n1. Amoxicilina 500 mg cápsula\n   ");
  body = addToPrescription(body + "Tomar 1 cápsula de 8/8 h por 7 dias", dipi);
  assert.equal(body, "Uso oral\n\n1. Amoxicilina 500 mg cápsula\n   Tomar 1 cápsula de 8/8 h por 7 dias\n\n2. Dipirona 500 mg comprimido\n   ");
});
