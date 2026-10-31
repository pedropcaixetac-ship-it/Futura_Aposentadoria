import { test } from "node:test";
import assert from "node:assert/strict";
import { noticeState, parseNotice, visibleNoticesWhere } from "../src/lib/avisos";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

const now = new Date("2026-10-31T15:00:00Z"); // 12h em Brasília
const base = { title: "Manutenção", body: "Fora do ar das 22h às 23h.", kind: "manutencao", audience: "todos" };

test("aviso sem datas entra no ar agora e fica até cada um fechar", () => {
  const n = parseNotice(form(base), now);
  assert.ok(typeof n !== "string");
  assert.equal(n.startsAt, now);
  assert.equal(n.endsAt, null);
  assert.equal(n.clinicId, null);
});

test("datas do aviso no dia inteiro de Brasília", () => {
  const n = parseNotice(form({ ...base, startsAt: "2026-11-02", endsAt: "2026-11-03", clinicId: "c1" }), now);
  assert.ok(typeof n !== "string");
  assert.equal(n.startsAt.toISOString(), "2026-11-02T03:00:00.000Z");
  assert.equal(n.endsAt!.toISOString(), "2026-11-04T02:59:59.000Z");
  assert.equal(n.clinicId, "c1");
  assert.equal(noticeState(n, now), "agendado");
});

test("aviso inválido", () => {
  assert.equal(typeof parseNotice(form({ ...base, title: "" }), now), "string");
  assert.equal(typeof parseNotice(form({ ...base, kind: "x" }), now), "string");
  assert.equal(typeof parseNotice(form({ ...base, audience: "x" }), now), "string");
  assert.match(parseNotice(form({ ...base, endsAt: "2026-10-30" }), now) as string, /já passou/);
  assert.match(parseNotice(form({ ...base, startsAt: "2026-11-05", endsAt: "2026-11-04" }), now) as string, /depois do início/);
});

test("situação do aviso", () => {
  assert.equal(noticeState({ startsAt: new Date("2026-10-30"), endsAt: null }, now), "no-ar");
  assert.equal(noticeState({ startsAt: new Date("2026-10-30"), endsAt: new Date("2026-10-31T10:00:00Z") }, now), "encerrado");
});

test("só gerentes do sistema veem avisos para gerentes", () => {
  assert.deepEqual(visibleNoticesWhere({ id: "u", clinicId: "c", role: "RECEPCAO" }, now).audience, { in: ["todos"] });
  assert.deepEqual(visibleNoticesWhere({ id: "u", clinicId: "c", role: "ADMIN" }, now).audience, { in: ["todos", "gerentes"] });
});
