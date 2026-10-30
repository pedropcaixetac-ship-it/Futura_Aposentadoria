import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { batchFileName, buildBatchXml, latin1, type BatchInput } from "../src/lib/tiss-xml";

const claim = {
  number: 7,
  operatorNumber: null,
  cardNumber: "0001234567",
  newborn: false,
  careRegime: "01",
  serviceDate: new Date("2026-10-30T00:00:00Z"),
  consultationType: 1,
  accidentIndication: 9,
  cbo: "225125",
  tussCode: "10101012",
  amountCents: 15050,
  notes: "Paciente com dor — retorno em 30 dias",
  professional: { name: "Ana Souza", councilType: "CRM", councilNumber: "123456", councilUf: "GO" },
};
const lote: BatchInput = {
  number: 3,
  createdAt: new Date("2026-10-30T15:04:05Z"),
  plan: { ansCode: "005711", providerCode: "998877" },
  clinic: { cnpj: "12.345.678/0001-90", cnes: "1234567" },
  claims: [claim, { ...claim, number: 8, operatorNumber: "ABC123", newborn: true, careRegime: "05", notes: null }],
};

function hasXmllint() {
  try {
    execFileSync("xmllint", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("lote TISS: campos principais e hash do epílogo", () => {
  const { xml, hash } = buildBatchXml(lote);
  assert.match(xml, /<ans:tipoTransacao>ENVIO_LOTE_GUIAS<\/ans:tipoTransacao>/);
  assert.match(xml, /<ans:horaRegistroTransacao>12:04:05<\/ans:horaRegistroTransacao>/); // horário de Brasília
  assert.match(xml, /<ans:valorProcedimento>150\.50<\/ans:valorProcedimento>/);
  assert.match(xml, /<ans:conselhoProfissional>06<\/ans:conselhoProfissional>/);
  assert.match(xml, /<ans:UF>52<\/ans:UF>/);
  assert.match(xml, /dor - retorno/);
  assert.equal(xml.match(/<ans:guiaConsulta>/g)?.length, 2);

  // O hash é o MD5 dos textos de todos os campos (fora o epílogo), em ISO-8859-1.
  const body = xml.slice(0, xml.indexOf("<ans:epilogo>"));
  const texts = [...body.matchAll(/<ans:[^>/]+>([^<]*)<\/ans:/g)].map((m) => m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  assert.equal(hash, createHash("md5").update(Buffer.from(texts.join(""), "latin1")).digest("hex"));
  assert.equal(batchFileName(3, hash), `00000000000000000003_${hash}.xml`);
});

test("lote TISS sem código no convênio usa o CNPJ da clínica", () => {
  const { xml } = buildBatchXml({ ...lote, plan: { ansCode: "005711", providerCode: null } });
  assert.match(xml, /<ans:CNPJ>12345678000190<\/ans:CNPJ>/);
  assert.match(xml, /<ans:cnpjContratado>12345678000190<\/ans:cnpjContratado>/);
});

test("texto fora do ISO-8859-1 é trocado ou retirado", () => {
  assert.equal(latin1("“Olá” – ok 😀"), '"Olá" - ok ');
});

test("lote TISS passa na validação dos schemas oficiais da ANS (4.03.00)", { skip: !hasXmllint() && "xmllint não instalado" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "tiss-"));
  for (const input of [lote, { ...lote, plan: { ansCode: "005711", providerCode: null } }]) {
    const file = join(dir, "lote.xml");
    writeFileSync(file, Buffer.from(buildBatchXml(input).xml, "latin1"));
    execFileSync("xmllint", ["--noout", "--schema", "tests/fixtures/tiss-4.03.00/tissV4_03_00.xsd", file], { stdio: "pipe" });
  }
});
