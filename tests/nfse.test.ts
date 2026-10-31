import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceFields, invoiceMissing, parseIssRate } from "../src/lib/nfse";
import { canIssueInvoice, canRequestInvoice } from "../src/lib/permissions";

const clinic = { name: "Clínica Teste", cnpj: "12345678000190", municipalRegistration: "123", cityIbgeCode: "5208707", serviceCode: "04.01.01", issRateBasisPoints: 200 };
const professional = { name: "Dra. Ana", cpf: "52998224725", municipalRegistration: "999" };
const charge = { description: "Consulta", amountCents: 30000, paidAt: new Date("2026-10-30T00:00:00Z"), patient: { name: "João", cpf: "11144477735" } };

test("nota com cadastro completo não tem pendências", () => {
  assert.deepEqual(invoiceMissing("PROFISSIONAL", clinic, professional, charge), []);
  assert.deepEqual(invoiceMissing("CLINICA", clinic, null, charge), []);
});

test("avisa o que falta para emitir a nota", () => {
  const missing = invoiceMissing("PROFISSIONAL", { ...clinic, serviceCode: null }, { ...professional, municipalRegistration: null }, { ...charge, patient: { name: "João", cpf: null } });
  assert.deepEqual(missing, ["inscrição municipal de Dra. Ana", "código do serviço (Financeiro › Notas fiscais)", "CPF do paciente João"]);
  assert.deepEqual(invoiceMissing("PROFISSIONAL", clinic, null, charge), ["profissional que atendeu (a cobrança está sem profissional)"]);
  assert.deepEqual(invoiceMissing("CLINICA", { ...clinic, cnpj: null }, professional, charge), ["CNPJ da clínica"]);
});

test("prestador da nota segue quem emite", () => {
  assert.equal(invoiceFields("CLINICA", clinic, professional, charge).provider.document, "12.345.678/0001-90");
  const f = invoiceFields("PROFISSIONAL", clinic, professional, charge);
  assert.equal(f.provider.document, "529.982.247-25");
  assert.equal(f.customer.document, "111.444.777-35");
  assert.equal(f.issCents, 600);
  assert.equal(f.issRate, "2%");
});

test("alíquota do ISS digitada", () => {
  assert.equal(parseIssRate("2"), 200);
  assert.equal(parseIssRate("2,5%"), 250);
  assert.equal(parseIssRate(""), null);
  assert.equal(parseIssRate("1"), "invalid");
  assert.equal(parseIssRate("abc"), "invalid");
});

test("quem pede e quem anota a nota", () => {
  const recepcao = { id: "r1", role: "RECEPCAO" as const, councilNumber: null };
  const admin = { id: "a1", role: "ADMIN" as const, councilNumber: null };
  const medica = { id: "m1", role: "PROFISSIONAL" as const, councilNumber: "123" };
  const outra = { id: "m2", role: "PROFISSIONAL" as const, councilNumber: "456" };
  const c = { professionalId: "m1" };
  assert.equal(canRequestInvoice(recepcao, c), true);
  assert.equal(canRequestInvoice(medica, c), true);
  assert.equal(canRequestInvoice(outra, c), false);
  // Nota do profissional: ele mesmo (ou o financeiro) anota. A recepção não.
  assert.equal(canIssueInvoice(medica, { issuer: "PROFISSIONAL" }, c), true);
  assert.equal(canIssueInvoice(outra, { issuer: "PROFISSIONAL" }, c), false);
  assert.equal(canIssueInvoice(recepcao, { issuer: "PROFISSIONAL" }, c), false);
  // Nota da clínica: só o financeiro.
  assert.equal(canIssueInvoice(medica, { issuer: "CLINICA" }, c), false);
  assert.equal(canIssueInvoice(admin, { issuer: "CLINICA" }, c), true);
});
