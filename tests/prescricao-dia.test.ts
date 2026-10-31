// Prescrição do dia: vale até as 12h do dia seguinte e o médico repete a de ontem.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayFromKey, dayKey, inDay, isDailyItem, localMidnight, prescriptionDayEnd, prescriptionDayOf,
  prescriptionDays, repeatableFromPreviousDay, repeatedStart, treatmentStart,
} from "../src/lib/prescricao";

const at = (iso: string) => new Date(iso);
// Horário de Brasília = UTC-3.
const brt = (s: string) => new Date(`${s}-03:00`);

function item(over: Partial<{ startAt: Date; endAt: Date | null; suspendedAt: Date | null; intervalHours: number | null; asNeeded: boolean; description: string }> = {}) {
  const startAt = over.startAt ?? brt("2026-10-30T09:00:00");
  return {
    kind: "MEDICAMENTO" as const, description: "Ceftriaxona 1 g", dose: "1 g", route: "Endovenosa (EV)",
    intervalHours: 12, asNeeded: false, suspendedAt: null, note: null,
    ...over, startAt, endAt: over.endAt === undefined ? prescriptionDayEnd(startAt) : over.endAt,
  };
}

test("a prescrição vale até as 12h do dia seguinte", () => {
  assert.deepEqual(prescriptionDayEnd(brt("2026-10-30T09:00:00")), brt("2026-10-31T12:00:00"));
  assert.deepEqual(prescriptionDayEnd(brt("2026-10-30T23:30:00")), brt("2026-10-31T12:00:00"));
  assert.deepEqual(localMidnight(brt("2026-10-30T01:00:00")), brt("2026-10-30T00:00:00"));
});

test("dia da lista: chave e volta", () => {
  const d = localMidnight(brt("2026-10-30T15:00:00"));
  assert.equal(dayKey(d), "2026-10-30");
  assert.deepEqual(dayFromKey("2026-10-30"), d);
  assert.equal(dayFromKey("30/10/2026"), null);
});

test("cada item pertence ao dia em que foi prescrito, mesmo valendo até o dia seguinte", () => {
  const i = item();
  assert.deepEqual(prescriptionDayOf(i), brt("2026-10-30T00:00:00"));
  assert.equal(inDay(i, brt("2026-10-30T00:00:00")), true);
  assert.equal(inDay(i, brt("2026-10-31T00:00:00")), false);
  assert.equal(isDailyItem(i), true);
});

test("lista de dias vai do primeiro item até hoje, com a contagem", () => {
  const days = prescriptionDays([item(), item({ startAt: brt("2026-10-28T10:00:00") })], brt("2026-10-31T00:00:00"));
  assert.deepEqual(days.map((d) => [d.key, d.count]), [["2026-10-31", 0], ["2026-10-30", 1], ["2026-10-29", 0], ["2026-10-28", 1]]);
});

test("repetir a de ontem: não repete suspenso, dose única nem o que já foi repetido", () => {
  const today = brt("2026-10-31T00:00:00");
  const atb = item();
  const suspended = item({ description: "Dipirona", suspendedAt: brt("2026-10-30T18:00:00") });
  const single = item({ description: "Ondansetrona", intervalHours: null });
  const sn = item({ description: "Paracetamol", intervalHours: null, asNeeded: true });
  assert.deepEqual(repeatableFromPreviousDay([atb, suspended, single, sn], today).map((i) => i.description), ["Ceftriaxona 1 g", "Paracetamol"]);
  const copy = item({ startAt: repeatedStart(atb), endAt: prescriptionDayEnd(today) });
  assert.deepEqual(repeatableFromPreviousDay([atb, suspended, single, sn, copy], today).map((i) => i.description), ["Paracetamol"]);
});

test("o repetido continua os horários depois das 12h, sem dose dobrada de manhã", () => {
  // De 12/12h começando 09:00: ontem 09h e 21h; hoje 09h ainda é da prescrição de ontem (vale até 12h).
  assert.deepEqual(repeatedStart(item()), brt("2026-10-31T21:00:00"));
  assert.deepEqual(repeatedStart(item({ intervalHours: 6 })), brt("2026-10-31T15:00:00"));
  assert.deepEqual(repeatedStart(item({ asNeeded: true, intervalHours: null })), brt("2026-10-31T12:00:00"));
});

test("CCIH conta o D do antibiótico desde o primeiro dia, mesmo renovado todo dia", () => {
  const d1 = item({ startAt: brt("2026-10-28T09:00:00") });
  const d2 = item({ startAt: repeatedStart(d1), endAt: brt("2026-10-30T12:00:00") });
  const d3 = item({ startAt: repeatedStart(d2), endAt: brt("2026-10-31T12:00:00") });
  assert.deepEqual(treatmentStart(d3, [d1, d2, d3]), d1.startAt);
  // Suspenso no meio: recomeça a contagem.
  assert.deepEqual(treatmentStart(d3, [d1, { ...d2, suspendedAt: at("2026-10-29T20:00:00Z") }, d3]), d3.startAt);
});
