import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import type { Patient } from "@prisma/client";
import { buildLaudoPdf } from "../src/lib/laudo-pdf";
import { laudoDefaults, laudoText, LAUDO_TYPES, parseLaudo, laudoSummary } from "../src/lib/laudos";
import { documentHash } from "../src/lib/record";

const patient = {
  name: "Maria José da Conceição",
  birthDate: new Date("1958-04-23T00:00:00Z"),
  sex: "F",
  cns: "898 0011 6066 0761",
  cpf: "52998224725",
  motherName: "Ana Maria",
  phone: "62999887766",
  street: "Rua 10",
  number: "250",
  complement: null,
  district: "Setor Oeste",
  city: "Goiânia",
  state: "GO",
  cep: "74120020",
  guardianName: null,
  guardianPhone: null,
  landline: null,
  email: "maria@exemplo.com",
} as unknown as Patient;
const professional = {
  name: "Ana Paula",
  jobTitle: "Médico(a)",
  sex: "F",
  cns: null,
  cpf: "11144477735",
  councilType: "CRM",
  councilNumber: "12345",
  councilUf: "GO",
  rqe: "678",
};
const clinic = { name: "Clínica Futura", cnes: "1234567" };

test("laudo já vem com os dados do paciente, da clínica e do profissional", () => {
  const today = new Date("2026-10-31T12:00:00Z");
  const apac = laudoDefaults("APAC", { clinic, patient, professional, today });
  assert.equal(apac.estabelecimento, "Clínica Futura");
  assert.equal(apac.cnes, "1234567");
  assert.equal(apac.cns, "898001160660761");
  assert.equal(apac.nascimento, "1958-04-23");
  assert.equal(apac.endereco, "Rua 10, 250 - Setor Oeste");
  assert.equal(apac.profissionalNome, "Dra. Ana Paula");
  assert.equal(apac.profissionalDocTipo, "CPF");
  assert.equal(apac.dataSolicitacao, "2026-10-31");

  const lme = laudoDefaults("LME", { clinic, patient, professional, vitals: { peso: 72.5, altura: 165 } });
  assert.equal(lme.peso, "72,5");
  assert.equal(lme.altura, "165");
  assert.equal(lme.pacienteDoc, "898001160660761");
  // A LME não tem campo de endereço: não leva o que não existe no formulário.
  assert.equal(lme.endereco, undefined);
});

test("laudo sem os campos obrigatórios não é emitido", () => {
  const form = new FormData();
  form.set("laudo_pacienteNome", "Maria");
  form.set("laudo_sexo", "X"); // opção que não existe é descartada
  const { values, missing } = parseLaudo("APAC", form);
  assert.equal(values.sexo, undefined);
  assert.ok(missing.includes("Código do procedimento principal"));
  assert.ok(missing.includes("CID-10 principal"));
});

test("texto do laudo e resumo para a lista", () => {
  const values = { procCodigo: "0303060026", procNome: "Tratamento clínico", cidPrincipal: "I50.0", sexo: "F", nascimento: "1958-04-23" };
  const text = laudoText("APAC", values);
  assert.match(text, /Sexo: Feminino/);
  assert.match(text, /Data de nascimento: 23\/04\/1958/);
  assert.equal(laudoSummary("APAC", values), "0303060026 Tratamento clínico · CID I50.0");
  assert.equal(laudoSummary("LME", { med1: "Adalimumabe", med2: "Metotrexato" }), "Adalimumabe, Metotrexato");
});

test("impressão digital do laudo cobre os campos, em qualquer ordem", () => {
  const base = { id: "1", patientId: "p", authorId: "a", type: "AIH" as const, body: "x", createdAt: new Date(0) };
  const a = documentHash({ ...base, fields: { b: "2", a: "1" } });
  assert.equal(a, documentHash({ ...base, fields: { a: "1", b: "2" } }));
  assert.notEqual(a, documentHash({ ...base, fields: { a: "1", b: "3" } }));
  // Documentos antigos (sem campos) continuam com a mesma impressão digital.
  assert.equal(documentHash({ ...base, fields: null }), documentHash(base));
});

test("gera APAC, AIH e LME no formulário oficial, com folha extra para a assinatura digital", async () => {
  for (const type of LAUDO_TYPES) {
    const values = {
      ...laudoDefaults(type, { clinic, patient, professional }),
      cidPrincipal: "I50.0",
      procCodigo: "0303060026",
      telefone: "6232221111",
      observacoes: "Texto longo 😀 ".repeat(200),
      sinaisSintomas: "Dor ".repeat(500),
    };
    const bytes = await buildLaudoPdf({ type, values, stamp: ["Dra. Ana Paula", "CRM 12345/GO"], clinicName: "Clínica", author: "Dra. Ana", integrityCode: "abc" });
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.equal(pdf.getSubject(), type);

    const signed = await buildLaudoPdf({ type, values, stamp: [], clinicName: "Clínica", author: "x", signatureStamp: ["Assinado"] });
    assert.equal((await PDFDocument.load(signed)).getPageCount(), 2);
  }
});
