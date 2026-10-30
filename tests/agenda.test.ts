import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  clinicParts,
  clinicTime,
  freeSlots,
  layoutLanes,
  nextStatuses,
  parseMinutes,
  startOfWeek,
} from "../src/lib/agenda";
import { canManageAgendaOf, canSeeAllAgendas, canStartFromAppointment, canUseReception } from "../src/lib/permissions";

const medica = { id: "m1", role: "PROFISSIONAL" as const, councilNumber: "123" };
const recepcao = { id: "r1", role: "RECEPCAO" as const, councilNumber: null };

test("horário de Brasília é convertido corretamente", () => {
  const instant = clinicTime("2026-10-30", 8 * 60 + 30);
  assert.equal(instant.toISOString(), "2026-10-30T11:30:00.000Z");
  assert.deepEqual(clinicParts(instant), { date: "2026-10-30", minutes: 510, weekday: 5 });
  // 22h em Brasília já é o dia seguinte em UTC, mas continua sendo o mesmo dia na clínica.
  assert.equal(clinicParts(clinicTime("2026-10-30", 22 * 60)).date, "2026-10-30");
});

test("contas de datas", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(startOfWeek("2026-10-30"), "2026-10-26");
  assert.equal(startOfWeek("2026-11-01"), "2026-10-26");
  assert.equal(parseMinutes("08:30"), 510);
  assert.equal(parseMinutes("25:00"), null);
});

test("horários livres descontam consultas e bloqueios", () => {
  const busy = [
    { start: clinicTime("2026-10-30", 8 * 60 + 30), end: clinicTime("2026-10-30", 9 * 60) },
    { start: clinicTime("2026-10-30", 9 * 60 + 40), end: clinicTime("2026-10-30", 10 * 60) },
  ];
  const slots = freeSlots("2026-10-30", [{ startMinute: 8 * 60, endMinute: 10 * 60 + 15, slotMinutes: 30 }], busy);
  assert.deepEqual(
    slots.map((s) => clinicParts(s.start).minutes),
    [8 * 60, 9 * 60],
  );
});

test("encaixes ficam lado a lado", () => {
  const at = (m: number, d: number) => ({ start: clinicTime("2026-10-30", m), end: clinicTime("2026-10-30", m + d) });
  const a = at(480, 30);
  const b = at(490, 30);
  const c = at(600, 30);
  const result = layoutLanes([a, b, c]);
  const of = (x: object) => result.find((r) => r.item === x)!;
  assert.deepEqual([of(a).lane, of(a).lanes], [0, 2]);
  assert.deepEqual([of(b).lane, of(b).lanes], [1, 2]);
  assert.deepEqual([of(c).lane, of(c).lanes], [0, 1]);
});

test("situações que podem ser marcadas à mão", () => {
  assert.ok(nextStatuses("AGENDADO").includes("CHEGOU"));
  assert.deepEqual(nextStatuses("ATENDIDO"), []);
  assert.deepEqual(nextStatuses("EM_ATENDIMENTO"), []);
});

test("recepção cuida da agenda de todos; profissional só da própria", () => {
  assert.equal(canSeeAllAgendas(recepcao), true);
  assert.equal(canSeeAllAgendas(medica), false);
  assert.equal(canManageAgendaOf(medica, "m1"), true);
  assert.equal(canManageAgendaOf(medica, "m2"), false);
  assert.equal(canStartFromAppointment(medica, { professionalId: "m1" }), true);
  assert.equal(canStartFromAppointment(recepcao, { professionalId: "r1" }), false);
});

test("só recepção e administrador marcam presença", () => {
  assert.equal(canUseReception(recepcao), true);
  assert.equal(canUseReception(medica), false);
});

test("aba Atender é só para quem atende", async () => {
  const { hasTab } = await import("../src/lib/tabs");
  const comAbas = <T extends object>(u: T) => ({ ...u, customTabs: false, allowedTabs: [] as string[] });
  assert.equal(hasTab(comAbas(medica), "atender"), true);
  assert.equal(hasTab(comAbas(recepcao), "atender"), false);
});
