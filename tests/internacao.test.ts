// Versão hospitalar: mapa de leitos e internação. A parte do banco precisa dele rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { bedState, compareBedCodes, daysAdmitted, daysLabel, occupancy, parseBedCodes } from "../src/lib/internacao";
import { hasTab, tabInInstitution } from "../src/lib/tabs";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

test("cadastro de vários leitos de uma vez", () => {
  assert.deepEqual(parseBedCodes("101 a 104").codes, ["101", "102", "103", "104"]);
  assert.deepEqual(parseBedCodes("01 a 03").codes, ["01", "02", "03"]);
  assert.deepEqual(parseBedCodes("201-a, 201-B\n202").codes, ["201-A", "201-B", "202"]);
  assert.deepEqual(parseBedCodes("101, 101, 101 a 102").codes, ["101", "102"]);
  assert.ok(parseBedCodes("110 a 101").error);
  assert.ok(parseBedCodes("1 a 500").error);
  assert.ok(parseBedCodes("  ").error);
});

test("ordem dos leitos e ocupação", () => {
  assert.deepEqual(["10", "2", "101-B", "101-A"].sort(compareBedCodes), ["2", "10", "101-A", "101-B"]);
  const states = [bedState({ status: "LIVRE" }, true), bedState({ status: "LIVRE" }, false), bedState({ status: "LIMPEZA" }, false), bedState({ status: "BLOQUEADO" }, false)];
  assert.deepEqual(states, ["OCUPADO", "LIVRE", "LIMPEZA", "BLOQUEADO"]);
  // Bloqueado não conta: 1 ocupado de 3 disponíveis.
  assert.deepEqual(occupancy(states), { total: 4, ocupados: 1, livres: 1, limpeza: 1, bloqueados: 1, percentual: 33 });
  assert.equal(occupancy([]).percentual, 0);
});

test("dias de internação no horário de Brasília", () => {
  // Internou às 23h de Brasília (02h UTC do dia seguinte); 1h depois já é outro dia.
  assert.equal(daysAdmitted(new Date("2026-10-31T02:00:00Z"), new Date("2026-10-31T03:30:00Z")), 1);
  assert.equal(daysAdmitted(new Date("2026-10-30T12:00:00Z"), new Date("2026-10-30T20:00:00Z")), 0);
  assert.equal(daysLabel(0), "Internou hoje");
  assert.equal(daysLabel(1), "1 dia");
  assert.equal(daysLabel(5), "5 dias");
});

test("aba Internação só existe no hospital; clínica continua igual", () => {
  const base = { id: "u", role: "RECEPCAO" as const, councilNumber: null, customTabs: false, allowedTabs: [] };
  const clinica = { ...base, institution: "CLINICA" };
  const hospital = { ...base, institution: "HOSPITAL" };
  // Recepção do hospital: o mesmo da clínica (com financeiro) e mais as visitas; internar não é dela.
  assert.equal(hasTab(clinica, "visitas"), false);
  assert.equal(hasTab(clinica, "financeiro"), true);
  assert.equal(hasTab(hospital, "financeiro"), true);
  assert.equal(hasTab(hospital, "recepcao"), true);
  assert.equal(hasTab(hospital, "visitas"), true);
  assert.equal(hasTab(hospital, "internacao"), false);
  assert.equal(hasTab(hospital, "leitos"), false);
  assert.equal(hasTab({ ...hospital, role: "PROFISSIONAL", councilNumber: "1" }, "internacao"), true);
  assert.equal(hasTab({ ...hospital, role: "ADMIN" }, "leitos"), true);
  // Gerente do hospital continua com a gestão; "Meu financeiro" segue a regra de sempre (profissional de saúde).
  assert.equal(hasTab({ ...hospital, role: "PROFISSIONAL", councilNumber: "1" }, "meu-financeiro"), true);
  for (const tab of ["financeiro", "contabilidade", "internacao"] as const) assert.equal(hasTab({ ...hospital, role: "ADMIN" }, tab), true);
  // Gerente da clínica não ganha aba hospitalar nem por ser gerente.
  assert.equal(hasTab({ ...clinica, role: "ADMIN" }, "leitos"), false);
  assert.equal(tabInInstitution("CLINICA", "contabilidade"), true);
  assert.equal(tabInInstitution("HOSPITAL", "contabilidade"), true);
  assert.equal(tabInInstitution(null, "internacao"), false);
});

async function hospital(label: string) {
  const slug = `hosp-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: `Hospital ${label}`, slug, kind: "HOSPITAL" } });
  const doctor = await prisma.user.create({ data: { clinicId: clinic.id, name: "Médica", email: `${slug}@t.com`, passwordHash: "-", role: "PROFISSIONAL", councilNumber: "1" } });
  const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: "Enfermaria" } });
  const [bed1, bed2] = await Promise.all(["1", "2"].map((code) => prisma.bed.create({ data: { clinicId: clinic.id, wardId: ward.id, code } })));
  const [p1, p2] = await Promise.all(["A", "B"].map((n) => prisma.patient.create({ data: { clinicId: clinic.id, name: `Paciente ${n}` } })));
  return { clinic, doctor, ward, bed1, bed2, p1, p2 };
}

const admit = (h: Awaited<ReturnType<typeof hospital>>, patientId: string, bedId: string) =>
  prisma.admission.create({ data: { clinicId: h.clinic.id, patientId, bedId, attendingId: h.doctor.id, admittedById: h.doctor.id, origin: "Pronto-socorro" } });

test("banco não deixa dois pacientes no mesmo leito nem o mesmo paciente internado duas vezes", async () => {
  const h = await hospital("a");
  const first = await admit(h, h.p1.id, h.bed1.id);
  await assert.rejects(admit(h, h.p2.id, h.bed1.id), /Unique constraint/);
  await assert.rejects(admit(h, h.p1.id, h.bed2.id), /Unique constraint/);
  // Depois da alta o leito e o paciente ficam livres de novo.
  await prisma.admission.update({ where: { id: first.id }, data: { dischargedAt: new Date(), dischargeKind: "MELHORADO" } });
  await admit(h, h.p2.id, h.bed1.id);
  await admit(h, h.p1.id, h.bed2.id);
});

test("banco recusa internação com leito ou paciente de outro hospital", async () => {
  const a = await hospital("b");
  const b = await hospital("c");
  await assert.rejects(admit(a, b.p1.id, a.bed1.id), /outra clínica/);
  await assert.rejects(admit(a, a.p1.id, b.bed1.id), /outra clínica/);
  await assert.rejects(prisma.bed.create({ data: { clinicId: a.clinic.id, wardId: b.ward.id, code: "9" } }), /outra clínica/);
});

test("visita só se liga a internação do mesmo hospital", async () => {
  const a = await hospital("d");
  const b = await hospital("e");
  const admission = await admit(b, b.p1.id, b.bed1.id);
  await assert.rejects(
    prisma.visit.create({ data: { clinicId: a.clinic.id, admissionId: admission.id, visitorName: "Visitante", registeredById: a.doctor.id } }),
    /outra clínica/,
  );
  await prisma.visit.create({ data: { clinicId: b.clinic.id, admissionId: admission.id, visitorName: "Visitante", registeredById: b.doctor.id } });
});
