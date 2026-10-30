import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessAccounting } from "../src/lib/permissions";
import { activeInMonth, fgts, laborAlerts, nthBusinessDay, obligationDueDate, toCsv, trackedSince, vacationPeriods } from "../src/lib/accounting";
import { monthRange } from "../src/lib/finance";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date | null) => date?.toISOString().slice(0, 10);

test("só administrador e auxiliar administrativo acessam a contabilidade", () => {
  assert.equal(canAccessAccounting({ id: "1", role: "ADMIN", councilNumber: null }), true);
  assert.equal(canAccessAccounting({ id: "2", role: "ADMINISTRATIVO", councilNumber: null }), true);
  assert.equal(canAccessAccounting({ id: "3", role: "RECEPCAO", councilNumber: null }), false);
  assert.equal(canAccessAccounting({ id: "4", role: "PROFISSIONAL", councilNumber: "123" }), false);
});

test("5º dia útil do mês", () => {
  // Novembro de 2026 começa num domingo: 2, 3, 4, 5, 6 são os dias úteis.
  assert.equal(iso(nthBusinessDay("2026-11", 5)), "2026-11-06");
  // Agosto de 2026 começa num sábado.
  assert.equal(iso(nthBusinessDay("2026-08", 1)), "2026-08-03");
});

test("vencimento das obrigações", () => {
  const fgtsRule = { dueDay: 20, businessDay: false, onlyMonth: null };
  assert.equal(iso(obligationDueDate(fgtsRule, "2026-10")), "2026-10-20");
  // 20/12/2026 é domingo: antecipa para sexta, 18.
  assert.equal(iso(obligationDueDate(fgtsRule, "2026-12")), "2026-12-18");
  // Dia 30 em fevereiro vira o último dia do mês (27/02/2027 é sábado, então sexta 26).
  assert.equal(iso(obligationDueDate({ dueDay: 30, businessDay: false, onlyMonth: null }, "2027-02")), "2027-02-26");
  // Obrigação anual só aparece no mês dela.
  const decimo = { dueDay: 30, businessDay: false, onlyMonth: 11 };
  assert.equal(obligationDueDate(decimo, "2026-10"), null);
  assert.equal(iso(obligationDueDate(decimo, "2026-11")), "2026-11-30");
});

test("férias: períodos, prazo e dias tirados", () => {
  const admission = d("2024-03-01");
  const { periods, current } = vacationPeriods(admission, [{ startDate: d("2025-06-01"), endDate: d("2025-06-30") }, { startDate: d("2026-04-01"), endDate: d("2026-04-14") }], d("2026-10-30"));
  assert.equal(periods.length, 2);
  assert.equal(iso(periods[0].end), "2025-02-28");
  assert.equal(iso(periods[0].deadline), "2026-02-28");
  assert.equal(periods[0].remaining, 0);
  assert.equal(periods[1].daysTaken, 14);
  assert.equal(periods[1].remaining, 16);
  assert.equal(iso(current.start), "2026-03-01");
});

test("avisos trabalhistas", () => {
  const ref = d("2026-10-30");
  // Em experiência.
  const novo = laborAlerts({ type: "CLT", admissionDate: d("2026-10-01"), terminatedAt: null }, [], ref);
  assert.match(novo[0].text, /experiência termina em 29\/12\/2026/);
  // Férias vencidas: pagar em dobro.
  const antigo = laborAlerts({ type: "CLT", admissionDate: d("2023-01-10"), terminatedAt: null }, [], ref);
  assert.equal(antigo[0].tone, "red");
  assert.match(antigo[0].text, /vencidas/);
  // PJ e desligados não têm avisos.
  assert.deepEqual(laborAlerts({ type: "PJ", admissionDate: d("2023-01-10"), terminatedAt: null }, [], ref), []);
  assert.deepEqual(laborAlerts({ type: "CLT", admissionDate: d("2023-01-10"), terminatedAt: d("2026-01-01") }, [], ref), []);
});

test("folha: quem entra no mês e FGTS", () => {
  const out = monthRange("2026-10");
  assert.equal(activeInMonth({ admissionDate: d("2026-10-31"), terminatedAt: null }, out), true);
  assert.equal(activeInMonth({ admissionDate: d("2026-11-01"), terminatedAt: null }, out), false);
  assert.equal(activeInMonth({ admissionDate: d("2025-01-01"), terminatedAt: d("2026-10-01") }, out), true);
  assert.equal(activeInMonth({ admissionDate: d("2025-01-01"), terminatedAt: d("2026-09-30") }, out), false);
  assert.equal(fgts(220000, "CLT"), 17600);
  assert.equal(fgts(220000, "PJ"), 0);
});

test("planilha CSV para o Excel", () => {
  const csv = toCsv([["Nome", "Valor"], ['Clínica "Boa; Saúde"', "1,50"]]);
  assert.equal(csv, '﻿Nome;Valor\r\n"Clínica ""Boa; Saúde""";1,50');
});

test("vencimentos antes de começar a usar não contam como atraso", () => {
  assert.equal(trackedSince(d("2026-10-20"), new Date("2026-10-30T15:00:00Z")), false);
  assert.equal(trackedSince(d("2026-10-30"), new Date("2026-10-30T15:00:00Z")), true);
});
