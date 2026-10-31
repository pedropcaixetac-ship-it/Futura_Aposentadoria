import { test } from "node:test";
import assert from "node:assert/strict";
import { billingStatus, clinicBlocked, institutionModules, nextPaidUntil, sanitizeModules, tabInPlan } from "../src/lib/plans";
import { hasTab } from "../src/lib/tabs";

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const today = day("2026-10-30");

test("situação da mensalidade conforme o 'pago até'", () => {
  assert.deepEqual(billingStatus(null, today), { kind: "sem-controle" });
  assert.deepEqual(billingStatus(day("2026-11-30"), today), { kind: "em-dia", daysLeft: 31 });
  assert.deepEqual(billingStatus(day("2026-11-04"), today), { kind: "vence-logo", daysLeft: 5 });
  assert.deepEqual(billingStatus(day("2026-10-30"), today), { kind: "vence-logo", daysLeft: 0 });
  assert.deepEqual(billingStatus(day("2026-10-29"), today), { kind: "atrasada", daysLate: 1, daysToBlock: 10 });
  assert.deepEqual(billingStatus(day("2026-10-20"), today), { kind: "atrasada", daysLate: 10, daysToBlock: 1 });
  assert.deepEqual(billingStatus(day("2026-10-19"), today), { kind: "bloqueada", daysLate: 11 });
});

test("clínica bloqueada por suspensão ou por atraso além da tolerância", () => {
  assert.equal(clinicBlocked({ active: true, paidUntil: null }, today), null);
  assert.equal(clinicBlocked({ active: false, paidUntil: null }, today), "suspensa");
  assert.equal(clinicBlocked({ active: true, paidUntil: day("2026-10-20") }, today), null);
  assert.equal(clinicBlocked({ active: true, paidUntil: day("2026-10-19") }, today), "atrasada");
});

test("registrar pagamento estende um mês", () => {
  assert.equal(nextPaidUntil(day("2026-11-10"), today).toISOString().slice(0, 10), "2026-12-10");
  // Pagou atrasado, dentro da tolerância: conta a partir do vencimento antigo.
  assert.equal(nextPaidUntil(day("2026-10-25"), today).toISOString().slice(0, 10), "2026-11-25");
  // Bloqueada há muito tempo ou sem data: conta a partir de hoje.
  assert.equal(nextPaidUntil(day("2026-08-01"), today).toISOString().slice(0, 10), "2026-11-30");
  assert.equal(nextPaidUntil(null, today).toISOString().slice(0, 10), "2026-11-30");
  // Fim de mês não pula para o mês seguinte.
  assert.equal(nextPaidUntil(day("2027-01-31"), day("2027-01-20")).toISOString().slice(0, 10), "2027-02-28");
});

test("módulos fora do plano somem até para o gerente do sistema", () => {
  assert.deepEqual(sanitizeModules(["financeiro", "inventado", "assinatura"]), ["financeiro", "assinatura"]);
  assert.equal(tabInPlan(null, "contabilidade"), true);
  assert.equal(tabInPlan(["financeiro"], "contabilidade"), false);
  assert.equal(tabInPlan(["financeiro"], "meu-financeiro"), true);
  assert.equal(tabInPlan([], "agenda"), true);

  const gerente = { id: "g", role: "ADMIN" as const, councilNumber: null, customTabs: false, allowedTabs: [] };
  assert.equal(hasTab(gerente, "contabilidade"), true);
  assert.equal(hasTab({ ...gerente, modules: ["financeiro"] }, "contabilidade"), false);
  assert.equal(hasTab({ ...gerente, modules: ["financeiro"] }, "financeiro"), true);
  assert.equal(hasTab({ ...gerente, modules: [] }, "pacientes"), true);
});

test("hospital fica sem a gestão da clínica; clínica não muda", () => {
  // Clínica: exatamente o que o plano libera.
  assert.equal(institutionModules("CLINICA", null), null);
  assert.deepEqual(institutionModules("CLINICA", ["financeiro"]), ["financeiro"]);
  // Hospital: sem financeiro e contabilidade, mesmo sem plano ou com plano que os tenha.
  assert.deepEqual(institutionModules("HOSPITAL", null), ["assinatura"]);
  assert.deepEqual(institutionModules("HOSPITAL", ["financeiro", "contabilidade", "assinatura"]), ["assinatura"]);

  const gerente = { id: "g", role: "ADMIN" as const, councilNumber: null, customTabs: false, allowedTabs: [], modules: institutionModules("HOSPITAL", null) };
  for (const tab of ["financeiro", "meu-financeiro", "contabilidade"] as const) assert.equal(hasTab(gerente, tab), false);
  for (const tab of ["recepcao", "agenda", "pacientes", "modelos", "auditoria", "servidores"] as const) assert.equal(hasTab(gerente, tab), true);
  const medica = { id: "m", role: "PROFISSIONAL" as const, councilNumber: "123", customTabs: false, allowedTabs: [], modules: institutionModules("HOSPITAL", null) };
  for (const tab of ["atender", "agenda", "modelos", "textos-prontos", "assinatura"] as const) assert.equal(hasTab(medica, tab), true);
  assert.equal(hasTab(medica, "meu-financeiro"), false);
});
