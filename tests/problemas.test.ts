// Registro de problemas (Painel do dono → Problemas). A última parte precisa do banco rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { alertEmail } from "../src/lib/alerts";
import { cleanPage, errorFingerprint, pageGroup, parseReport, recordError, validateReport } from "../src/lib/problems";

after(() => prisma.$disconnect());

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

test("tela registrada sem os parâmetros, que podem ter dados de paciente", () => {
  assert.equal(cleanPage("/pacientes?busca=Maria%20Silva"), "/pacientes");
  assert.equal(cleanPage("/agenda#hoje"), "/agenda");
  assert.equal(cleanPage("https://outro-site.com/x"), null);
  assert.equal(cleanPage(""), null);
});

test("mesmo erro em pacientes diferentes conta como um só", () => {
  const a = "/pacientes/cmhd4x9k20001abcdefghij12/atendimentos/cmhd4x9k20002abcdefghij34";
  const b = "/pacientes/cmhd4x9k20003zyxwvutsrq56/atendimentos/cmhd4x9k20004zyxwvutsrq78";
  assert.equal(pageGroup(a), "/pacientes/:id/atendimentos/:id");
  assert.equal(errorFingerprint("Falhou", a), errorFingerprint("Falhou", b));
  assert.notEqual(errorFingerprint("Falhou", a), errorFingerprint("Outro erro", a));
  assert.notEqual(errorFingerprint("Falhou", "/agenda"), errorFingerprint("Falhou", "/financeiro"));
});

test("relato precisa dizer o que aconteceu", () => {
  const ok = parseReport(form({ message: "  A agenda não abre  ", page: "/agenda?dia=2026-10-30", digest: "123abc" }));
  assert.deepEqual(ok, { message: "A agenda não abre", page: "/agenda", digest: "123abc" });
  assert.equal(validateReport(ok), null);
  assert.ok(validateReport(parseReport(form({ message: "oi" }))));
  assert.ok(validateReport(parseReport(form({ message: "x".repeat(1001) }))));
});

test("erro repetido soma na mesma linha em vez de encher a lista", async () => {
  const message = `Erro de teste ${Date.now()}-${Math.random()}`;
  await recordError({ message, page: "/pacientes/cmhd4x9k20001abcdefghij12?x=1", digest: "d1" });
  await recordError({ message, page: "/pacientes/cmhd4x9k20003zyxwvutsrq56", digest: "d2" });
  const rows = await prisma.problemReport.findMany({ where: { message } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].digest, "d2");
  assert.equal(rows[0].page, "/pacientes/cmhd4x9k20001abcdefghij12");

  // Depois de resolvido, se voltar a acontecer, aparece de novo.
  await prisma.problemReport.update({ where: { id: rows[0].id }, data: { resolvedAt: new Date() } });
  await recordError({ message, page: "/pacientes/cmhd4x9k20001abcdefghij12" });
  assert.equal(await prisma.problemReport.count({ where: { message } }), 2);
  await prisma.problemReport.deleteMany({ where: { message } });
});

test("e-mail de aviso diz o que, onde e quem", () => {
  const { subject, text } = alertEmail(
    { kind: "RELATO", message: "A agenda\nnão abre", page: "/agenda", clinicName: "Clínica X", userName: "Júlia" },
    "https://exemplo.com/painel/problemas",
  );
  assert.equal(subject, "Relato de problema · Clínica X: A agenda não abre");
  assert.match(text, /Tela: \/agenda/);
  assert.match(text, /Júlia/);
  assert.match(text, /https:\/\/exemplo\.com\/painel\/problemas/);
  assert.match(alertEmail({ kind: "ERRO", message: "x", page: null }, null).subject, /^Erro no sistema: x$/);
});
