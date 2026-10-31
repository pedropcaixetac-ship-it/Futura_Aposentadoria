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

test("pedido de nota no formato da Focus NFe", async () => {
  const { buildDps, readFocusResponse } = await import("../src/lib/nfse-focus");
  const dps = buildDps({
    issuer: "PROFISSIONAL",
    clinic: { ...clinic, taxRegime: "Simples Nacional" },
    professional,
    charge: { ...charge, patient: { ...charge.patient, email: "joao@exemplo.com" } },
    dpsNumber: 7,
    now: new Date("2026-10-31T13:00:00Z"),
  });
  assert.equal(dps.data_emissao, "2026-10-31T10:00:00-03:00");
  assert.equal(dps.data_competencia, "2026-10-30");
  assert.equal(dps.numero_dps, 7);
  assert.equal(dps.codigo_municipio_emissora, 5208707);
  assert.equal((dps as { cpf_prestador?: string }).cpf_prestador, "52998224725");
  assert.equal("cnpj_prestador" in dps, false);
  assert.equal(dps.regime_especial_tributacao, "5");
  assert.equal(dps.codigo_opcao_simples_nacional, "1");
  assert.equal(dps.codigo_tributacao_nacional_iss, "040101");
  assert.equal(dps.valor_servico, 300);
  assert.equal(dps.cpf_tomador, "11144477735");

  const daClinica = buildDps({ issuer: "CLINICA", clinic: { ...clinic, taxRegime: "Simples Nacional" }, professional, charge: { ...charge, patient: { ...charge.patient, email: null } }, dpsNumber: 1, now: new Date() });
  assert.equal((daClinica as { cnpj_prestador?: string }).cnpj_prestador, "12345678000190");
  assert.equal(daClinica.codigo_opcao_simples_nacional, "3");
  assert.equal("email_tomador" in daClinica, false);

  assert.deepEqual(readFocusResponse(202, { status: "processando_autorizacao" }), { state: "processando" });
  assert.deepEqual(readFocusResponse(200, { status: "autorizado", numero: "74798", codigo_verificacao: "ABC123", url: "u", url_danfse: "p" }), {
    state: "autorizada", number: "74798", verificationCode: "ABC123", url: "u", pdfUrl: "p",
  });
  assert.deepEqual(readFocusResponse(200, { status: "erro_autorizacao", erros: [{ codigo: "E0014", mensagem: "DPS repetida" }] }), { state: "erro", message: "E0014: DPS repetida" });
  assert.equal(readFocusResponse(422, { mensagem: "CPF inválido" }).state, "erro");
});
