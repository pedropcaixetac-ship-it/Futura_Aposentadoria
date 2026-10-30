import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildPdf } from "../src/lib/pdf";

const base = {
  clinicName: "Clínica Demonstração",
  title: "Atestado",
  info: ["Paciente: João da Conceição"],
  professional: { name: "Dra. Ana", council: "CRM 12345/GO", specialty: "Clínica médica" },
  place: "Emitido em 30/10/2026 10:00",
  integrityCode: "abc123",
};

test("gera PDF com acentos e não quebra com emoji", async () => {
  const bytes = await buildPdf({ ...base, sections: [{ text: "Atesto afastamento por três dias, ação imediata 😀 ≥" }] });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getTitle(), "Atestado");
});

test("texto longo continua em novas páginas", async () => {
  const text = Array.from({ length: 200 }, (_, i) => `Linha ${i + 1} do relatório clínico.`).join("\n");
  const bytes = await buildPdf({ ...base, sections: [{ title: "Relatório", text }, { text: "x".repeat(500) }] });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 3);
});
