// Versão hospitalar: prescrição e checagem. A parte do banco precisa dele rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { doseState, doseTimes, frequencyLabel, medicationProgress } from "../src/lib/prescricao";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

const at = (iso: string) => new Date(iso);
const base = { endAt: null, suspendedAt: null, asNeeded: false };

test("horários das doses dentro do plantão", () => {
  const item = { ...base, startAt: at("2026-10-30T11:00:00Z"), intervalHours: 8 };
  // Dia do plantão 31/10 7h a 01/11 7h (10h UTC a 10h UTC): 11h, 19h e 03h UTC.
  assert.deepEqual(doseTimes(item, at("2026-10-31T10:00:00Z"), at("2026-11-01T10:00:00Z")).map((d) => d.toISOString()), [
    "2026-10-31T11:00:00.000Z", "2026-10-31T19:00:00.000Z", "2026-11-01T03:00:00.000Z",
  ]);
  // Suspenso às 18h: a dose das 19h não aparece mais.
  assert.equal(doseTimes({ ...item, suspendedAt: at("2026-10-31T18:00:00Z") }, at("2026-10-31T10:00:00Z"), at("2026-11-01T10:00:00Z")).length, 1);
  // Dose única: só se cair na janela. Se necessário: sem horário.
  assert.equal(doseTimes({ ...base, startAt: at("2026-10-31T12:00:00Z"), intervalHours: null }, at("2026-10-31T10:00:00Z"), at("2026-11-01T10:00:00Z")).length, 1);
  assert.equal(doseTimes({ ...base, startAt: at("2026-10-31T12:00:00Z"), intervalHours: null, asNeeded: true }, at("2026-10-31T10:00:00Z"), at("2026-11-01T10:00:00Z")).length, 0);
  assert.equal(frequencyLabel({ intervalHours: 6, asNeeded: false }), "de 6/6h");
  assert.equal(frequencyLabel({ intervalHours: null, asNeeded: true }), "se necessário");
});

test("situação do horário: atrasado depois de 30 minutos", () => {
  const t = at("2026-10-31T12:00:00Z");
  assert.equal(doseState(t, undefined, at("2026-10-31T12:31:00Z")), "ATRASADO");
  assert.equal(doseState(t, undefined, at("2026-10-31T11:45:00Z")), "AGORA");
  assert.equal(doseState(t, undefined, at("2026-10-31T10:00:00Z")), "PREVISTO");
  assert.equal(doseState(t, { status: "FEITO" }, at("2026-10-31T15:00:00Z")), "FEITO");
});

test("pronto-socorro: com todas as doses feitas, aguarda reavaliação", () => {
  const now = at("2026-10-31T12:20:00Z");
  const single = { ...base, startAt: at("2026-10-31T12:00:00Z"), intervalHours: null, checks: [] as { scheduledAt: Date | null; canceledAt: Date | null }[] };
  assert.deepEqual(medicationProgress([single], now), { due: 1, done: 0, waitingReview: false });
  single.checks.push({ scheduledAt: at("2026-10-31T12:00:00Z"), canceledAt: null });
  assert.deepEqual(medicationProgress([single], now), { due: 1, done: 1, waitingReview: true });
  // Checagem anulada não conta.
  single.checks[0].canceledAt = now;
  assert.equal(medicationProgress([single], now).waitingReview, false);
});

async function hospital(label: string) {
  const slug = `rx-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: `Hospital ${label}`, slug, kind: "HOSPITAL" } });
  const doctor = await prisma.user.create({ data: { clinicId: clinic.id, name: "Médica", email: `${slug}@t.com`, passwordHash: "-", role: "PROFISSIONAL", councilNumber: "1", councilType: "CRM" } });
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente" } });
  const visit = await prisma.emergencyVisit.create({ data: { clinicId: clinic.id, patientId: patient.id, complaint: "Dor", registeredById: doctor.id } });
  return { clinic, doctor, patient, visit };
}

const item = (h: Awaited<ReturnType<typeof hospital>>) =>
  prisma.prescriptionItem.create({
    data: { clinicId: h.clinic.id, patientId: h.patient.id, emergencyVisitId: h.visit.id, prescriberId: h.doctor.id, description: "Dipirona", route: "Endovenosa (EV)", startAt: new Date() },
  });

test("item prescrito não muda nem some; só é suspenso uma vez", async () => {
  const h = await hospital("a");
  const rx = await item(h);
  await assert.rejects(prisma.prescriptionItem.update({ where: { id: rx.id }, data: { dose: "10 mL" } }), /não podem ser alterados/);
  await assert.rejects(prisma.prescriptionItem.delete({ where: { id: rx.id } }), /não podem ser excluídos/);
  await prisma.prescriptionItem.update({ where: { id: rx.id }, data: { suspendedAt: new Date(), suspendedById: h.doctor.id, suspendReason: "alergia" } });
  await assert.rejects(prisma.prescriptionItem.update({ where: { id: rx.id }, data: { suspendReason: "outro" } }), /não podem ser alterados/);
});

test("checagem: um horário só tem uma checagem valendo, e ela só é anulada", async () => {
  const h = await hospital("b");
  const rx = await item(h);
  const data = { clinicId: h.clinic.id, itemId: rx.id, scheduledAt: rx.startAt, status: "FEITO" as const, recordedById: h.doctor.id };
  const check = await prisma.medicationCheck.create({ data });
  await assert.rejects(prisma.medicationCheck.create({ data }), /Unique constraint/);
  await assert.rejects(prisma.medicationCheck.update({ where: { id: check.id }, data: { status: "NAO_FEITO" } }), /não podem ser alterados/);
  await prisma.medicationCheck.update({ where: { id: check.id }, data: { canceledAt: new Date(), canceledById: h.doctor.id, cancelReason: "horário errado" } });
  await prisma.medicationCheck.create({ data });
});

test("prescrição vale para internação ou PS (não os dois) e só na mesma instituição", async () => {
  const a = await hospital("c");
  const b = await hospital("d");
  await assert.rejects(
    prisma.prescriptionItem.create({ data: { clinicId: a.clinic.id, patientId: a.patient.id, prescriberId: a.doctor.id, description: "X", startAt: new Date() } }),
    /um_contexto/,
  );
  await assert.rejects(
    prisma.prescriptionItem.create({ data: { clinicId: a.clinic.id, patientId: a.patient.id, emergencyVisitId: b.visit.id, prescriberId: a.doctor.id, description: "X", startAt: new Date() } }),
    /outra clínica/,
  );
});
