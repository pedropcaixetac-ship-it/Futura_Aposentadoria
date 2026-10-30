import { test } from "node:test";
import assert from "node:assert/strict";
import { afterFailure, isLocked, LOCK_MINUTES, MAX_FAILURES, parseBirthDate, sameDay } from "../src/lib/patient-app";

test("data de nascimento: aceita o campo do celular e dd/mm/aaaa", () => {
  assert.equal(parseBirthDate("1990-12-31")?.toISOString(), "1990-12-31T00:00:00.000Z");
  assert.equal(parseBirthDate("31/12/1990")?.toISOString(), "1990-12-31T00:00:00.000Z");
  assert.equal(parseBirthDate("31/02/1990"), null);
  assert.equal(parseBirthDate("ontem"), null);
});

test("data de nascimento: compara só o dia", () => {
  assert.ok(sameDay(new Date("1990-12-31T00:00:00Z"), parseBirthDate("31/12/1990")!));
  assert.ok(!sameDay(new Date("1990-12-30T00:00:00Z"), parseBirthDate("31/12/1990")!));
});

test("trava a entrada depois de várias tentativas erradas", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  let p = { appLoginFailures: 0, appLockedUntil: null as Date | null };
  for (let i = 1; i < MAX_FAILURES; i++) {
    p = afterFailure(p, now);
    assert.equal(p.appLoginFailures, i);
    assert.ok(!isLocked(p, now));
  }
  p = afterFailure(p, now);
  assert.ok(isLocked(p, now));
  assert.equal(p.appLoginFailures, 0);
  assert.ok(!isLocked(p, new Date(now.getTime() + LOCK_MINUTES * 60 * 1000 + 1)));
});
