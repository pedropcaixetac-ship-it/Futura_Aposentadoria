import { test } from "node:test";
import assert from "node:assert/strict";
import { excerpt, filterEncounters, groupByYear, highlight, parseHistoryFilters } from "../src/lib/history";
import { parseBrDate } from "../src/lib/format";

const fields = [{ key: "conduta", label: "Conduta", type: "textarea" as const }];
const consulta = (dia: string, profissional: string, texto: string, cid = "", templateId: string | null = null) => ({
  startedAt: new Date(`${dia}T10:00:00-03:00`),
  professionalId: profissional,
  templateId,
  fields,
  content: { conduta: texto },
  diagnoses: cid ? [{ code: cid, description: "Diagnóstico" }] : [],
  addenda: [] as { text: string }[],
});

const historico = [
  consulta("2026-05-10", "ana", "Prescrita Dipirona 500mg", "J45.0", "t1"),
  consulta("2026-01-03", "carlos", "Sessão de acompanhamento"),
  consulta("2025-11-20", "ana", "Cefaléia há 3 dias", "I10"),
];

test("busca por palavra ignora acentos e maiúsculas", () => {
  const f = parseHistoryFilters({ palavra: "cefaleia" });
  assert.equal(filterEncounters(historico, f).length, 1);
  assert.equal(filterEncounters(historico, parseHistoryFilters({ palavra: "DIPIRONA" })).length, 1);
});

test("filtros de profissional, tipo, CID e período", () => {
  assert.equal(filterEncounters(historico, parseHistoryFilters({ profissional: "ana" })).length, 2);
  assert.equal(filterEncounters(historico, parseHistoryFilters({ modelo: "livre" })).length, 2);
  assert.equal(filterEncounters(historico, parseHistoryFilters({ cid: "j45" })).length, 1);
  assert.equal(filterEncounters(historico, parseHistoryFilters({ de: "2026-01-01", ate: "2026-01-03" })).length, 1);
  assert.equal(filterEncounters(historico, parseHistoryFilters({ de: "data-errada" })).length, 3);
});

test("destaque encontra a palavra mesmo com acento diferente", () => {
  const parts = highlight("Paciente com cefaléia forte", "cefaleia");
  assert.deepEqual(parts.filter((p) => p.match).map((p) => p.text), ["cefaléia"]);
  assert.equal(parts.map((p) => p.text).join(""), "Paciente com cefaléia forte");
});

test("trecho mostra o entorno da palavra", () => {
  const texto = `${"a".repeat(200)} dipirona ${"b".repeat(200)}`;
  const t = excerpt([texto], "dipirona", 10);
  assert.ok(t?.startsWith("…") && t.endsWith("…") && t.includes("dipirona"));
});

test("agrupa por ano, do mais recente para o mais antigo", () => {
  assert.deepEqual(groupByYear(historico).map((g) => [g.year, g.items.length]), [[2026, 2], [2025, 1]]);
});

test("data de nascimento digitada na busca", () => {
  assert.equal(parseBrDate("31/12/1990")?.toISOString(), "1990-12-31T00:00:00.000Z");
  assert.equal(parseBrDate("31/02/1990"), null);
  assert.equal(parseBrDate("Maria"), null);
});
