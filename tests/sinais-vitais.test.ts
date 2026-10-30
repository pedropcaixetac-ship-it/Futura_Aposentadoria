import { test } from "node:test";
import assert from "node:assert/strict";
import { bmi, bmiLabel, parseVitals, vitalsSummary } from "../src/lib/vitals";
import { encounterHash } from "../src/lib/record";

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(`vital_${k}`, v);
  return fd;
}

test("lê sinais vitais aceitando vírgula e descartando valores impossíveis", () => {
  assert.deepEqual(parseVitals(form({ pas: "120", pad: "80", temp: "36,5", fc: "999", peso: "" })), { pas: 120, pad: 80, temp: 36.5 });
  assert.equal(parseVitals(form({ pas: "", fc: "abc" })), null);
});

test("IMC calculado a partir de peso e altura", () => {
  assert.equal(bmi({ peso: 70, altura: 175 }), 22.9);
  assert.equal(bmi({ peso: 70 }), null);
  assert.equal(bmiLabel(22.9), "Peso adequado");
  assert.equal(bmiLabel(31), "Obesidade grau I");
});

test("resumo dos sinais vitais", () => {
  assert.equal(vitalsSummary({ pas: 120, pad: 80, fc: 72, peso: 70, altura: 175 }), "PA 120x80 mmHg · FC 72 bpm · Peso 70 kg · Altura 175 cm · IMC 22,9");
});

test("atendimentos sem sinais vitais mantêm o mesmo código de integridade de antes", () => {
  const base = {
    id: "e1",
    patientId: "p1",
    professionalId: "m1",
    fields: [],
    content: {},
    diagnoses: [],
    finalizedAt: new Date("2026-10-30T10:00:00Z"),
  };
  assert.equal(encounterHash(base), encounterHash({ ...base, vitals: null }));
  assert.notEqual(encounterHash(base), encounterHash({ ...base, vitals: { pas: 120 } }));
});
