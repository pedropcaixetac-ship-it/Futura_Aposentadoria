// Regras da teleconsulta. O último teste precisa do banco rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { consentText, councilLabel, teleconsultationState } from "../src/lib/teleconsulta";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

test("situação do link da teleconsulta", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const later = new Date("2026-10-31T12:00:00Z");
  const before = new Date("2026-10-29T12:00:00Z");
  assert.equal(teleconsultationState({ endedAt: null, expiresAt: later, consentAt: null }, now), "AGUARDANDO_TERMO");
  assert.equal(teleconsultationState({ endedAt: null, expiresAt: later, consentAt: now }, now), "LIBERADA");
  assert.equal(teleconsultationState({ endedAt: null, expiresAt: before, consentAt: now }, now), "EXPIRADA");
  assert.equal(teleconsultationState({ endedAt: now, expiresAt: later, consentAt: now }, now), "ENCERRADA");
});

test("termo cita o profissional, o conselho e a resolução do CFM", () => {
  const council = councilLabel({ councilType: "CRM", councilNumber: "12345", councilUf: "GO" });
  assert.equal(council, "CRM 12345/GO");
  const text = consentText({ clinicName: "Clínica X", professionalName: "Dra. Ana", council });
  assert.match(text, /Dra\. Ana \(CRM 12345\/GO\)/);
  assert.match(text, /2\.314\/2022/);
  assert.match(text, /não é gravada/);
});

test("termo aceito não pode ser alterado e a teleconsulta não pode ser excluída", async () => {
  const clinic = await prisma.clinic.create({ data: { name: "Clínica de teste", slug: `teste-tc-${Date.now()}` } });
  const professional = await prisma.user.create({
    data: { clinicId: clinic.id, name: "Teste", email: "t@t.com", passwordHash: "-", role: "PROFISSIONAL" },
  });
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente Teste" } });
  const encounter = await prisma.encounter.create({
    data: { clinicId: clinic.id, patientId: patient.id, professionalId: professional.id, fields: [] },
  });
  const t = await prisma.teleconsultation.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      professionalId: professional.id,
      encounterId: encounter.id,
      token: `tok-${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  await prisma.teleconsultation.update({ where: { id: t.id }, data: { consentAt: new Date(), consentText: "termo" } });
  // Registrar a entrada e o encerramento continua permitido.
  await prisma.teleconsultation.update({ where: { id: t.id }, data: { endedAt: new Date() } });

  await assert.rejects(prisma.teleconsultation.update({ where: { id: t.id }, data: { consentText: "outro" } }), /não pode ser alterado/);
  await assert.rejects(prisma.teleconsultation.delete({ where: { id: t.id } }), /não podem ser excluídas/);
});
