// Versão hospitalar: pronto-socorro. A parte do banco precisa dele rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { compareQueue, isPhysician, minutesBetween, overdue, waitLabel } from "../src/lib/pronto-socorro";
import { hasTab } from "../src/lib/tabs";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

test("fila do médico: cor mais grave primeiro; na mesma cor, quem foi triado antes", () => {
  const at = (min: number) => new Date(Date.UTC(2026, 9, 31, 12, min));
  const visits = [
    { id: "verde-cedo", risk: "VERDE" as const, triagedAt: at(0), arrivedAt: at(0) },
    { id: "amarelo-tarde", risk: "AMARELO" as const, triagedAt: at(30), arrivedAt: at(20) },
    { id: "amarelo-cedo", risk: "AMARELO" as const, triagedAt: at(10), arrivedAt: at(5) },
    { id: "vermelho", risk: "VERMELHO" as const, triagedAt: at(40), arrivedAt: at(40) },
    { id: "sem-triagem", risk: null, triagedAt: null, arrivedAt: at(1) },
  ];
  assert.deepEqual([...visits].sort(compareQueue).map((v) => v.id), ["vermelho", "amarelo-cedo", "amarelo-tarde", "verde-cedo", "sem-triagem"]);
});

test("tempo de espera e atraso pela cor", () => {
  assert.equal(minutesBetween(new Date("2026-10-31T12:00:00Z"), new Date("2026-10-31T13:15:30Z")), 75);
  assert.equal(minutesBetween(new Date("2026-10-31T13:00:00Z"), new Date("2026-10-31T12:00:00Z")), 0);
  assert.equal(waitLabel(5), "5 min");
  assert.equal(waitLabel(75), "1h15");
  assert.equal(waitLabel(120), "2h");
  assert.equal(overdue("VERMELHO", 0), true);
  assert.equal(overdue("LARANJA", 10), false);
  assert.equal(overdue("LARANJA", 11), true);
  assert.equal(overdue("AZUL", 200), false);
});

test("no PS só o médico chama e dá o desfecho; enfermagem tria", () => {
  assert.equal(isPhysician({ role: "PROFISSIONAL", councilNumber: "1", councilType: "CRM" }), true);
  assert.equal(isPhysician({ role: "PROFISSIONAL", councilNumber: "1", councilType: "COREN" }), false);
  assert.equal(isPhysician({ role: "TECNICO", councilNumber: null, councilType: null }), false);
  assert.equal(isPhysician({ role: "ADMIN", councilNumber: null, councilType: "CRM" }), false);
});

test("aba Pronto-socorro só existe no hospital", () => {
  const base = { id: "u", role: "RECEPCAO" as const, councilNumber: null, customTabs: false, allowedTabs: [] };
  assert.equal(hasTab({ ...base, institution: "CLINICA" }, "pronto-socorro"), false);
  assert.equal(hasTab({ ...base, institution: "HOSPITAL" }, "pronto-socorro"), true);
  assert.equal(hasTab({ ...base, role: "ADMIN", institution: "CLINICA" }, "pronto-socorro"), false);
});

async function hospital(label: string) {
  const slug = `ps-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: `Hospital ${label}`, slug, kind: "HOSPITAL" } });
  const user = await prisma.user.create({ data: { clinicId: clinic.id, name: "Recepção", email: `${slug}@t.com`, passwordHash: "-", role: "RECEPCAO" } });
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente" } });
  return { clinic, user, patient };
}

test("banco não deixa o mesmo paciente com duas passagens abertas no PS", async () => {
  const h = await hospital("a");
  const data = { clinicId: h.clinic.id, patientId: h.patient.id, complaint: "Dor", registeredById: h.user.id };
  const first = await prisma.emergencyVisit.create({ data });
  await assert.rejects(prisma.emergencyVisit.create({ data }), /Unique constraint/);
  await prisma.emergencyVisit.update({ where: { id: first.id }, data: { status: "ENCERRADO", outcome: "ALTA", closedAt: new Date() } });
  await prisma.emergencyVisit.create({ data });
});

test("banco recusa passagem no PS com paciente ou funcionário de outro hospital", async () => {
  const a = await hospital("b");
  const b = await hospital("c");
  await assert.rejects(
    prisma.emergencyVisit.create({ data: { clinicId: a.clinic.id, patientId: b.patient.id, complaint: "Dor", registeredById: a.user.id } }),
    /outra clínica/,
  );
  const visit = await prisma.emergencyVisit.create({ data: { clinicId: a.clinic.id, patientId: a.patient.id, complaint: "Dor", registeredById: a.user.id } });
  await assert.rejects(prisma.emergencyVisit.update({ where: { id: visit.id }, data: { triagedById: b.user.id } }), /outra clínica/);
});
