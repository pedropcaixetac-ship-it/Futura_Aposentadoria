// Versão hospitalar: quem faz o quê pela profissão, e as abas que cada cargo recebe.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAdjustPharmacyStock, canAdministerChemo, canDischarge, canDispenseControlled, canJudgeSterilization,
  canReleaseLabResult, canTriage, canWorkInfectionControl, hospitalTabsFor,
} from "../src/lib/hospital-roles";
import { hasTab, type TabKey } from "../src/lib/tabs";

const person = (role: string, councilType: string | null, extra: object = {}) => ({ role, councilType, councilNumber: councilType ? "123" : null, jobTitle: null, ...extra });
const medico = person("PROFISSIONAL", "CRM");
const enfermeiro = person("PROFISSIONAL", "COREN");
const tecnico = person("TECNICO", "COREN");
const farmaceutico = person("PROFISSIONAL", "CRF");
const nutricionista = person("PROFISSIONAL", "CRN");
const biomedico = person("PROFISSIONAL", "CRBM");
const gerente = person("ADMIN", null);
const administrativo = person("ADMINISTRATIVO", null);

test("alta só o médico", () => {
  assert.equal(canDischarge(medico), true);
  for (const p of [enfermeiro, nutricionista, gerente, tecnico]) assert.equal(canDischarge(p), false);
  // Sem número do conselho não vale, mesmo marcando CRM.
  assert.equal(canDischarge({ ...medico, councilNumber: null }), false);
});

test("classificação de risco: enfermeiro ou médico, nunca o técnico", () => {
  assert.equal(canTriage(enfermeiro), true);
  assert.equal(canTriage(medico), true);
  assert.equal(canTriage(tecnico), false);
  assert.equal(canTriage(nutricionista), false);
});

test("quimioterapia aplicada só pelo enfermeiro; CME liberada só pelo enfermeiro", () => {
  assert.equal(canAdministerChemo(enfermeiro), true);
  assert.equal(canAdministerChemo(tecnico), false);
  assert.equal(canAdministerChemo(medico), false);
  assert.equal(canJudgeSterilization(enfermeiro), true);
  assert.equal(canJudgeSterilization(tecnico), false);
  assert.equal(canJudgeSterilization(gerente), false);
});

test("laboratório, farmácia e CCIH", () => {
  for (const p of [biomedico, farmaceutico, medico]) assert.equal(canReleaseLabResult(p), true);
  for (const p of [enfermeiro, nutricionista, tecnico]) assert.equal(canReleaseLabResult(p), false);
  assert.equal(canAdjustPharmacyStock(farmaceutico), true);
  assert.equal(canAdjustPharmacyStock(gerente), true);
  assert.equal(canAdjustPharmacyStock(administrativo), false);
  assert.equal(canDispenseControlled(farmaceutico), true);
  assert.equal(canDispenseControlled(gerente), false);
  assert.equal(canWorkInfectionControl(medico), true);
  assert.equal(canWorkInfectionControl(enfermeiro), true);
  assert.equal(canWorkInfectionControl(nutricionista), false);
});

const tabsOf = (p: object, institution: string, keys: TabKey[]) =>
  keys.filter((k) => hasTab({ id: "x", customTabs: false, allowedTabs: [], institution, ...p } as unknown as Parameters<typeof hasTab>[0], k));

test("no hospital, as abas dos setores vêm pelo cargo", () => {
  const sectors: TabKey[] = ["pronto-socorro", "internacao", "farmacia", "cozinha", "cme", "laboratorio", "imagem", "almoxarifado", "contas", "chamados"];
  assert.deepEqual(tabsOf(nutricionista, "HOSPITAL", sectors), ["internacao", "cozinha", "chamados"]);
  assert.deepEqual(tabsOf(farmaceutico, "HOSPITAL", sectors), ["farmacia", "laboratorio", "chamados"]);
  assert.deepEqual(tabsOf(tecnico, "HOSPITAL", sectors), ["pronto-socorro", "internacao", "cme", "chamados"]);
  assert.deepEqual(tabsOf(administrativo, "HOSPITAL", sectors), ["internacao", "almoxarifado", "contas", "chamados"]);
  assert.deepEqual(tabsOf(gerente, "HOSPITAL", sectors), sectors);
  // As abas que não são de setor hospitalar seguem o perfil (o administrativo continua com o Financeiro).
  assert.deepEqual(tabsOf(administrativo, "HOSPITAL", ["financeiro", "pacientes"]), ["financeiro", "pacientes"]);
  // Técnico de laboratório (sem conselho) vai para o laboratório.
  assert.deepEqual(hospitalTabsFor({ role: "TECNICO", councilType: null, councilNumber: null, jobTitle: "Técnico(a) de laboratório" }), ["chamados", "laboratorio"]);
});

test("permissão escolhida pelo gerente continua valendo; na clínica nada muda", () => {
  assert.deepEqual(tabsOf({ ...nutricionista, customTabs: true, allowedTabs: ["farmacia"] }, "HOSPITAL", ["farmacia", "cozinha"]), ["farmacia"]);
  assert.deepEqual(tabsOf(nutricionista, "CLINICA", ["atender", "agenda", "pacientes"]), ["atender", "agenda", "pacientes"]);
});

test("internar: setor de internação, enfermagem e médico (decisão de Pedro)", async () => {
  const { canAdmit } = await import("../src/lib/hospital-roles");
  for (const p of [administrativo, gerente, enfermeiro, tecnico, medico]) assert.equal(canAdmit(p), true);
  for (const p of [nutricionista, farmaceutico, person("RECEPCAO", null)]) assert.equal(canAdmit(p), false);
});
