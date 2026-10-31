// Versão hospitalar: cozinha, CCIH e quimioterapia. A parte do banco precisa dele rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { currentMeal, isEnteral, isFasting, kitchenDate, productionCount } from "../src/lib/cozinha";
import { infectionDensity, isAntimicrobial, needsReview, patientDays, therapyDay } from "../src/lib/ccih";
import { bodySurface, buildSessions, computeDose, parseDays } from "../src/lib/quimio";
import { tabInInstitution } from "../src/lib/tabs";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

const at = (iso: string) => new Date(iso);

test("cozinha: refeição da vez e dia pelo horário de Brasília", () => {
  assert.equal(currentMeal(at("2026-10-31T09:00:00Z")), "DESJEJUM"); // 6h
  assert.equal(currentMeal(at("2026-10-31T13:45:00Z")), "ALMOCO"); // 10h45, almoço às 11h30
  assert.equal(currentMeal(at("2026-10-31T20:30:00Z")), "JANTAR"); // 17h30
  assert.equal(currentMeal(at("2026-11-01T01:00:00Z")), "CEIA"); // 22h
  assert.equal(kitchenDate(at("2026-11-01T01:00:00Z")).toISOString(), "2026-10-31T00:00:00.000Z");
});

test("cozinha: jejum não recebe bandeja e a produção conta cada dieta", () => {
  assert.equal(isFasting("Jejum a partir das 22h"), true);
  assert.equal(isFasting("Dieta zero"), true);
  assert.equal(isFasting("Dieta branda"), false);
  assert.equal(isEnteral("Dieta enteral por SNE 60 mL/h"), true);
  const count = productionCount([{ diets: ["Dieta branda"] }, { diets: ["Dieta branda"] }, { diets: ["Jejum"] }, { diets: [] }, { diets: ["Dieta livre"] }]);
  assert.deepEqual(count, { diets: [["Dieta branda", 2], ["Dieta livre", 1]], none: 1, fasting: 1 });
});

test("CCIH: antimicrobianos, dia de uso e revisão", () => {
  assert.equal(isAntimicrobial("Ceftriaxona 1 g"), true);
  assert.equal(isAntimicrobial("Piperacilina + tazobactam 4,5 g"), true);
  assert.equal(isAntimicrobial("Dipirona 500 mg/mL"), false);
  const start = at("2026-10-24T11:00:00Z");
  assert.equal(therapyDay(start, at("2026-10-24T20:00:00Z")), 1);
  assert.equal(therapyDay(start, at("2026-10-31T12:00:00Z")), 8);
  assert.equal(needsReview({ startAt: start, endAt: null }, at("2026-10-31T12:00:00Z")), true);
  assert.equal(needsReview({ startAt: start, endAt: at("2026-11-02T00:00:00Z") }, at("2026-10-31T12:00:00Z")), false);
});

test("CCIH: pacientes-dia e densidade de infecção", () => {
  const from = at("2026-10-01T03:00:00Z");
  const to = at("2026-10-31T03:00:00Z");
  const days = patientDays([
    { admittedAt: at("2026-09-20T03:00:00Z"), dischargedAt: at("2026-10-11T03:00:00Z") }, // 10 dias em outubro
    { admittedAt: at("2026-10-21T03:00:00Z"), dischargedAt: null }, // 10 dias
    { admittedAt: at("2026-08-01T03:00:00Z"), dischargedAt: at("2026-08-10T03:00:00Z") }, // fora
  ], from, to);
  assert.equal(days, 20);
  assert.equal(infectionDensity(1, 20), 50);
  assert.equal(infectionDensity(0, 0), 0);
});

test("quimio: superfície corporal (Mosteller) e doses", () => {
  assert.equal(bodySurface(160, 64), 1.69);
  const plan = { bsa: 1.69, weightKg: 64, doseLevel: 100 };
  assert.deepEqual(computeDose({ drug: "Doxorrubicina", dose: 60, unit: "mg/m²", route: "EV", days: [1] }, plan), { drug: "Doxorrubicina", prescribed: "60 mg/m²", dose: 101, doseUnit: "mg", route: "EV" });
  assert.equal(computeDose({ drug: "Carboplatina", dose: 5, unit: "mg/kg", route: "EV", days: [1] }, { ...plan, doseLevel: 80 }).dose, 256);
  assert.equal(computeDose({ drug: "X", dose: 12.5, unit: "mg", route: "VO", days: [1] }, plan).dose, 12.5);
});

test("quimio: dias do protocolo e calendário dos ciclos", () => {
  assert.deepEqual(parseDays("1, 8"), [1, 8]);
  assert.deepEqual(parseDays("1-3"), [1, 2, 3]);
  assert.equal(parseDays("0"), null);
  assert.equal(parseDays(""), null);
  const sessions = buildSessions(
    [
      { drug: "A", dose: 100, unit: "mg/m²", route: "EV", days: [1, 8] },
      { drug: "B", dose: 50, unit: "mg", route: "EV", days: [1] },
    ],
    21, 2, at("2026-11-02T00:00:00Z"), { bsa: 2, weightKg: 70, doseLevel: 100 },
  );
  assert.deepEqual(sessions.map((s) => [s.cycle, s.day, s.date.toISOString().slice(0, 10), s.doses.map((d) => d.drug).join("+")]), [
    [1, 1, "2026-11-02", "A+B"], [1, 8, "2026-11-09", "A"], [2, 1, "2026-11-23", "A+B"], [2, 8, "2026-11-30", "A"],
  ]);
});

test("as abas Cozinha, CCIH e Quimioterapia só aparecem no hospital", () => {
  for (const tab of ["cozinha", "ccih", "quimioterapia"] as const) {
    assert.equal(tabInInstitution("HOSPITAL", tab), true);
    assert.equal(tabInInstitution("CLINICA", tab), false);
  }
});

async function hospital(label: string) {
  const slug = `setor-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: `Hospital ${label}`, slug, kind: "HOSPITAL" } });
  const user = await prisma.user.create({ data: { clinicId: clinic.id, name: "Médica", email: `${slug}@t.com`, passwordHash: "-", role: "PROFISSIONAL", councilNumber: "1", councilType: "CRM" } });
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente" } });
  const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: "Ala" } });
  const bed = await prisma.bed.create({ data: { clinicId: clinic.id, wardId: ward.id, code: "1" } });
  const admission = await prisma.admission.create({ data: { clinicId: clinic.id, patientId: patient.id, bedId: bed.id, attendingId: user.id, admittedById: user.id, origin: "PS" } });
  return { clinic, user, patient, admission };
}

test("refeição: uma valendo por refeição do dia, e só se anula", async () => {
  const h = await hospital("a");
  const data = { clinicId: h.clinic.id, admissionId: h.admission.id, date: at("2026-10-31T00:00:00Z"), meal: "ALMOCO" as const, status: "ENTREGUE" as const, recordedById: h.user.id };
  const meal = await prisma.mealDelivery.create({ data });
  await assert.rejects(prisma.mealDelivery.create({ data }), /Unique constraint/);
  await assert.rejects(prisma.mealDelivery.update({ where: { id: meal.id }, data: { status: "RECUSOU" } }), /não podem ser alterados/);
  await prisma.mealDelivery.update({ where: { id: meal.id }, data: { canceledAt: new Date(), canceledById: h.user.id, cancelReason: "errado" } });
  await prisma.mealDelivery.create({ data });
});

test("isolamento: um aberto por tipo, só se encerra uma vez, nunca se apaga", async () => {
  const h = await hospital("b");
  const data = { clinicId: h.clinic.id, admissionId: h.admission.id, kind: "CONTATO" as const, reason: "KPC", startedById: h.user.id };
  const iso = await prisma.isolationPrecaution.create({ data });
  await assert.rejects(prisma.isolationPrecaution.create({ data }), /Unique constraint/);
  await assert.rejects(prisma.isolationPrecaution.update({ where: { id: iso.id }, data: { reason: "outro" } }), /só encerrados/);
  await prisma.isolationPrecaution.update({ where: { id: iso.id }, data: { endedAt: new Date(), endedById: h.user.id, endReason: "culturas negativas" } });
  await assert.rejects(prisma.isolationPrecaution.update({ where: { id: iso.id }, data: { endReason: "x" } }), /só encerrados/);
  await assert.rejects(prisma.isolationPrecaution.delete({ where: { id: iso.id } }), /não podem ser excluídos/);
});

test("quimio: sessão aplicada não muda e as doses gravadas não se alteram", async () => {
  const h = await hospital("c");
  const protocol = await prisma.chemoProtocol.create({ data: { clinicId: h.clinic.id, name: "P", cycleDays: 21, drugs: [] } });
  const plan = await prisma.chemoPlan.create({ data: { clinicId: h.clinic.id, patientId: h.patient.id, protocolId: protocol.id, physicianId: h.user.id, startDate: new Date(), cycles: 1, heightCm: 160, weightKg: 60, bsa: 1.63 } });
  const session = await prisma.chemoSession.create({ data: { clinicId: h.clinic.id, planId: plan.id, patientId: h.patient.id, cycle: 1, day: 1, date: new Date(), doses: [{ drug: "A", dose: 100 }] } });
  await assert.rejects(prisma.chemoSession.update({ where: { id: session.id }, data: { doses: [{ drug: "A", dose: 200 }] } }), /doses da sessão não mudam/);
  await prisma.chemoSession.update({ where: { id: session.id }, data: { status: "REALIZADA", administeredAt: new Date(), administeredById: h.user.id } });
  await assert.rejects(prisma.chemoSession.update({ where: { id: session.id }, data: { note: "x" } }), /já encerrada/);
  await assert.rejects(prisma.chemoSession.delete({ where: { id: session.id } }), /não podem ser excluídas/);
  await assert.rejects(prisma.chemoPlan.update({ where: { id: plan.id }, data: { doseLevel: 80 } }), /só encerrados/);
  await assert.rejects(prisma.chemoPlan.create({ data: { clinicId: h.clinic.id, patientId: h.patient.id, protocolId: protocol.id, physicianId: h.user.id, startDate: new Date(), cycles: 0, heightCm: 160, weightKg: 60, bsa: 1.63 } }), /ChemoPlan_valores/);
});

test("setores não aceitam ligação com outra instituição", async () => {
  const a = await hospital("d");
  const b = await hospital("e");
  await assert.rejects(
    prisma.isolationPrecaution.create({ data: { clinicId: a.clinic.id, admissionId: b.admission.id, kind: "CONTATO", reason: "x", startedById: a.user.id } }),
    /outra clínica/,
  );
  await assert.rejects(
    prisma.hospitalInfection.create({ data: { clinicId: a.clinic.id, admissionId: b.admission.id, site: "ITU", diagnosedAt: new Date(), reportedById: a.user.id } }),
    /outra clínica/,
  );
});
