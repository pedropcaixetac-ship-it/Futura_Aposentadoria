import { test } from "node:test";
import assert from "node:assert/strict";
import { canAddAddendum, canEditEncounter, canViewClinical } from "../src/lib/permissions";
import { encounterHash, parseDiagnoses, sanitizeContent } from "../src/lib/record";
import { isValidCpf } from "../src/lib/format";

const medica = { id: "m1", role: "PROFISSIONAL" as const, councilNumber: "123" };
const outraMedica = { id: "m2", role: "PROFISSIONAL" as const, councilNumber: "456" };
const recepcao = { id: "r1", role: "RECEPCAO" as const, councilNumber: null };
const admin = { id: "a1", role: "ADMIN" as const, councilNumber: null };

test("recepção e administrador sem conselho não veem o conteúdo clínico", () => {
  assert.equal(canViewClinical(medica), true);
  assert.equal(canViewClinical(recepcao), false);
  assert.equal(canViewClinical(admin), false);
});

test("só o autor edita o rascunho, e ninguém edita depois de finalizado", () => {
  assert.equal(canEditEncounter(medica, { professionalId: "m1", status: "RASCUNHO" }), true);
  assert.equal(canEditEncounter(outraMedica, { professionalId: "m1", status: "RASCUNHO" }), false);
  assert.equal(canEditEncounter(medica, { professionalId: "m1", status: "FINALIZADO" }), false);
});

test("adendo só em atendimento finalizado e por profissional de saúde", () => {
  assert.equal(canAddAddendum(outraMedica, { status: "FINALIZADO" }), true);
  assert.equal(canAddAddendum(medica, { status: "RASCUNHO" }), false);
  assert.equal(canAddAddendum(recepcao, { status: "FINALIZADO" }), false);
});

test("o código de integridade muda se o conteúdo mudar", () => {
  const base = {
    id: "e1",
    patientId: "p1",
    professionalId: "m1",
    fields: [{ key: "queixa", label: "Queixa", type: "textarea" }],
    content: { queixa: "Dor de cabeça" },
    diagnoses: [],
    finalizedAt: new Date("2026-10-30T10:00:00Z"),
  };
  assert.equal(encounterHash(base), encounterHash({ ...base }));
  assert.notEqual(encounterHash(base), encounterHash({ ...base, content: { queixa: "Dor nas costas" } }));
  // O banco devolve as chaves em outra ordem; o código não pode mudar por isso.
  const twoFields = { ...base, content: { queixa: "a", conduta: "b" } };
  assert.equal(encounterHash(twoFields), encounterHash({ ...twoFields, content: { conduta: "b", queixa: "a" } }));
});

test("conteúdo guarda só os campos do modelo", () => {
  const fields = [{ key: "queixa", label: "Queixa", type: "textarea" as const }];
  assert.deepEqual(sanitizeContent(fields, { queixa: "  febre ", extra: "x" }), { queixa: "febre" });
});

test("diagnósticos inválidos são ignorados", () => {
  assert.deepEqual(parseDiagnoses("não é json"), []);
  assert.deepEqual(parseDiagnoses('[{"code":"J45","description":"Asma"},{"code":1}]'), [{ code: "J45", description: "Asma" }]);
});

test("validação de CPF", () => {
  assert.equal(isValidCpf("111.444.777-35"), true);
  assert.equal(isValidCpf("111.444.777-36"), false);
  assert.equal(isValidCpf("00000000000"), false);
});
