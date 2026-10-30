import { test } from "node:test";
import assert from "node:assert/strict";
import { bookable, lastAppAction, MIN_NOTICE_MINUTES, afterFailure, isLocked, LOCK_MINUTES, MAX_FAILURES, parseBirthDate, patientCancelReason, patientCanCancel, patientCanConfirm, sameDay } from "../src/lib/patient-app";
import { statusText } from "../src/lib/agenda";

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

test("paciente confirma ou desmarca só consultas futuras que a recepção ainda não marcou chegada", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const later = new Date("2026-10-31T12:00:00Z");
  const before = new Date("2026-10-30T11:00:00Z");
  assert.ok(patientCanConfirm({ status: "AGENDADO", startsAt: later }, now));
  assert.ok(!patientCanConfirm({ status: "CONFIRMADO", startsAt: later }, now));
  assert.ok(!patientCanConfirm({ status: "AGENDADO", startsAt: before }, now));
  assert.ok(patientCanCancel({ status: "CONFIRMADO", startsAt: later }, now));
  assert.ok(!patientCanCancel({ status: "CHEGOU", startsAt: later }, now));
  assert.ok(!patientCanCancel({ status: "AGENDADO", startsAt: before }, now));
});

test("motivo da desmarcação pelo paciente", () => {
  assert.equal(patientCancelReason("  "), null);
  assert.equal(patientCancelReason(" viagem "), "viagem");
});

test("situação mostra \"pelo app\" quando foi o paciente", () => {
  const at = new Date();
  assert.equal(statusText({ status: "CONFIRMADO", confirmedInAppAt: at }), "Confirmado pelo app");
  assert.equal(statusText({ status: "CONFIRMADO", confirmedInAppAt: null }), "Confirmado");
  assert.equal(statusText({ status: "DESMARCADO", cancelledInAppAt: at }), "Desmarcado pelo app");
  assert.equal(statusText({ status: "CHEGOU", confirmedInAppAt: at }), "Chegou");
});

test("marcação pelo app respeita a antecedência mínima", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const at = (min: number) => ({ start: new Date(now.getTime() + min * 60_000) });
  assert.deepEqual(bookable([at(10), at(MIN_NOTICE_MINUTES), at(120)], now), [at(MIN_NOTICE_MINUTES), at(120)]);
});

test("quadro da recepção mostra a última ação do paciente no app", () => {
  const d = (h: number) => new Date(Date.UTC(2026, 9, 30, h));
  const base = { createdInAppAt: null, rescheduledInAppAt: null, cancelledInAppAt: null };
  assert.equal(lastAppAction({ ...base, status: "AGENDADO" }), null);
  assert.equal(lastAppAction({ ...base, status: "AGENDADO", createdInAppAt: d(1) })?.label, "Marcou");
  assert.equal(lastAppAction({ ...base, status: "AGENDADO", createdInAppAt: d(1), rescheduledInAppAt: d(2) })?.label, "Remarcou");
  assert.equal(lastAppAction({ ...base, status: "AGENDADO", rescheduledInAppAt: d(2) })?.label, "Remarcou");
  assert.equal(lastAppAction({ ...base, status: "DESMARCADO", createdInAppAt: d(1), cancelledInAppAt: d(3) })?.label, "Desmarcou");
  assert.equal(lastAppAction({ ...base, status: "DESMARCADO", createdInAppAt: d(1) }), null);
});

test("situação \"Agendado pelo app\" quando o paciente marcou ou remarcou", () => {
  assert.equal(statusText({ status: "AGENDADO", createdInAppAt: new Date() }), "Agendado pelo app");
  assert.equal(statusText({ status: "AGENDADO", rescheduledInAppAt: new Date() }), "Agendado pelo app");
  assert.equal(statusText({ status: "AGENDADO" }), "Agendado");
});
