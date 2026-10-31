// Versão hospitalar: pedido de parecer entre especialidades e transferência de especialidade (teste de caos de 31/10).
// A parte do banco precisa dele rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { canAnswerConsult, canRequestConsult, canTakeOver, canTransferAttending, sameSpecialty } from "../src/lib/especialidades";
import { isDoseTime } from "../src/lib/prescricao";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

const doctor = (id: string, specialty: string | null) => ({ id, role: "PROFISSIONAL", councilType: "CRM", councilNumber: "1", specialty });

test("especialidade igual mesmo com acento, maiúscula ou espaço", () => {
  assert.equal(sameSpecialty("Cardiologia", " cardiologia "), true);
  assert.equal(sameSpecialty("Clínica médica", "clinica medica"), true);
  assert.equal(sameSpecialty("Cardiologia", "Neurologia"), false);
  assert.equal(sameSpecialty("", ""), false);
});

test("quem responde o parecer: a especialidade pedida ou o profissional escolhido", () => {
  const cardio = doctor("c1", "Cardiologia");
  const neuro = doctor("n1", "Neurologia");
  assert.equal(canAnswerConsult(cardio, { specialty: "Cardiologia", consultantId: null }), true);
  assert.equal(canAnswerConsult(neuro, { specialty: "Cardiologia", consultantId: null }), false);
  // Pedido a um médico específico: só ele responde, mesmo outro da especialidade.
  assert.equal(canAnswerConsult(doctor("c2", "Cardiologia"), { specialty: "Cardiologia", consultantId: "c1" }), false);
  assert.equal(canAnswerConsult(cardio, { specialty: "Cardiologia", consultantId: "c1" }), true);
  // Nutricionista responde parecer de nutrição; técnico e recepção não.
  assert.equal(canAnswerConsult({ id: "x", role: "PROFISSIONAL", councilType: "CRN", councilNumber: "9", specialty: "Nutrição" }, { specialty: "Nutrição", consultantId: null }), true);
  assert.equal(canAnswerConsult({ id: "t", role: "TECNICO", councilType: "COREN", councilNumber: "9", specialty: "Nutrição" }, { specialty: "Nutrição", consultantId: null }), false);
  assert.equal(canAnswerConsult({ id: "r", role: "RECEPCAO", specialty: "Cardiologia" }, { specialty: "Cardiologia", consultantId: null }), false);
});

test("pedir parecer, transferir e assumir o paciente são do médico", () => {
  const nurse = { role: "PROFISSIONAL", councilType: "COREN", councilNumber: "2" };
  for (const can of [canRequestConsult, canTransferAttending, canTakeOver]) {
    assert.equal(can(doctor("d", "Cirurgia geral")), true);
    assert.equal(can(nurse), false);
    assert.equal(can({ role: "ADMINISTRATIVO" }), false);
  }
});

test("checagem só nos horários da prescrição (teste de caos: mesma dose com outro horário)", () => {
  const start = new Date("2026-11-01T08:00:00-03:00");
  const item = { startAt: start, endAt: null, suspendedAt: null, intervalHours: 6, asNeeded: false };
  assert.equal(isDoseTime(item, new Date("2026-11-01T14:00:00-03:00")), true);
  assert.equal(isDoseTime(item, new Date("2026-11-01T14:00:01-03:00")), false);
  assert.equal(isDoseTime(item, new Date("2026-11-01T14:37:00-03:00")), false);
  assert.equal(isDoseTime(item, new Date("2026-11-01T02:00:00-03:00")), false);
  // Depois da suspensão não há mais dose.
  assert.equal(isDoseTime({ ...item, suspendedAt: new Date("2026-11-01T12:00:00-03:00") }, new Date("2026-11-01T14:00:00-03:00")), false);
  // Dose única: só o horário de início; "se necessário" não tem horário.
  assert.equal(isDoseTime({ ...item, intervalHours: null }, start), true);
  assert.equal(isDoseTime({ ...item, asNeeded: true, intervalHours: null }, start), false);
});

async function hospital(label: string) {
  const slug = `esp-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: `Hospital ${label}`, slug, kind: "HOSPITAL" } });
  const mk = (n: string, specialty: string) =>
    prisma.user.create({ data: { clinicId: clinic.id, name: n, email: `${n}-${slug}@t.com`, passwordHash: "-", role: "PROFISSIONAL", councilNumber: "1", councilType: "CRM", specialty } });
  const clinico = await mk("clinico", "Clínica médica");
  const cirurgiao = await mk("cirurgiao", "Cirurgia geral");
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente" } });
  const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: "Ala", kind: "Enfermaria" } });
  const bed = await prisma.bed.create({ data: { clinicId: clinic.id, wardId: ward.id, code: "1" } });
  const admission = await prisma.admission.create({
    data: { clinicId: clinic.id, patientId: patient.id, bedId: bed.id, attendingId: clinico.id, admittedById: clinico.id, origin: "Pronto-socorro", specialty: "Clínica médica" },
  });
  return { clinic, clinico, cirurgiao, patient, admission };
}

test("parecer respondido não muda nem se apaga; histórico de especialidade é imutável", async () => {
  const h = await hospital("a");
  const consult = await prisma.consultRequest.create({
    data: { clinicId: h.clinic.id, admissionId: h.admission.id, patientId: h.patient.id, specialty: "Cirurgia geral", question: "Abdome agudo?", requestedById: h.clinico.id },
  });
  await assert.rejects(prisma.consultRequest.delete({ where: { id: consult.id } }), /não pode ser apagado/);
  await prisma.consultRequest.update({ where: { id: consult.id }, data: { status: "RESPONDIDO", answer: "Operar", answeredById: h.cirurgiao.id, answeredAt: new Date() } });
  await assert.rejects(prisma.consultRequest.update({ where: { id: consult.id }, data: { answer: "Não operar" } }), /não pode ser alterado/);
  const change = await prisma.attendingChange.create({
    data: { clinicId: h.clinic.id, admissionId: h.admission.id, fromAttendingId: h.clinico.id, toAttendingId: h.cirurgiao.id, fromSpecialty: "Clínica médica", toSpecialty: "Cirurgia geral", changedById: h.cirurgiao.id },
  });
  await assert.rejects(prisma.attendingChange.update({ where: { id: change.id }, data: { reason: "x" } }), /não pode ser alterado/);
  await assert.rejects(prisma.attendingChange.delete({ where: { id: change.id } }), /não pode ser alterado/);
});

test("parecer e transferência só dentro da mesma instituição", async () => {
  const a = await hospital("b");
  const b = await hospital("c");
  await assert.rejects(
    prisma.consultRequest.create({ data: { clinicId: a.clinic.id, admissionId: b.admission.id, patientId: a.patient.id, specialty: "X", question: "?", requestedById: a.clinico.id } }),
    /outra clínica/,
  );
  await assert.rejects(
    prisma.attendingChange.create({ data: { clinicId: a.clinic.id, admissionId: a.admission.id, fromAttendingId: a.clinico.id, toAttendingId: b.cirurgiao.id, changedById: a.clinico.id } }),
    /outra clínica/,
  );
});
