// Versão hospitalar: conta da internação. A parte do banco precisa dele rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { autoLines, billDays, billTotal, dailiesByWard, payerKind, roomHours } from "../src/lib/conta-hospitalar";
import { tabInInstitution } from "../src/lib/tabs";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

test("pagador pelo campo livre da internação", () => {
  assert.equal(payerKind("SUS"), "SUS");
  assert.equal(payerKind(" sus "), "SUS");
  assert.equal(payerKind("Particular"), "PARTICULAR");
  assert.equal(payerKind(""), "PARTICULAR");
  assert.equal(payerKind(null), "PARTICULAR");
  assert.equal(payerKind("Unimed"), "CONVENIO");
  assert.equal(payerKind("Sustentare Saúde"), "CONVENIO");
});

test("diárias pelo calendário de Brasília, no mínimo uma", () => {
  const at = (iso: string) => new Date(iso);
  assert.equal(billDays(at("2026-11-01T10:00:00-03:00"), at("2026-11-01T18:00:00-03:00")), 1);
  assert.equal(billDays(at("2026-11-01T23:00:00-03:00"), at("2026-11-02T08:00:00-03:00")), 1);
  assert.equal(billDays(at("2026-11-01T10:00:00-03:00"), at("2026-11-04T09:00:00-03:00")), 3);
  assert.equal(billDays(at("2026-11-01T10:00:00-03:00"), null, at("2026-11-06T09:00:00-03:00")), 5);
});

test("hora de sala: começada conta inteira; sem tempos usa a prevista", () => {
  const t = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 1, h, m));
  assert.equal(roomHours({ patientInAt: t(10), patientOutAt: t(11, 20), expectedMinutes: 60 }), 2);
  assert.equal(roomHours({ patientInAt: t(10), patientOutAt: t(10, 30), expectedMinutes: 60 }), 1);
  assert.equal(roomHours({ patientInAt: null, patientOutAt: null, expectedMinutes: 150 }), 3);
});

test("diárias seguem a ala de cada dia: UTI e depois enfermaria (teste de caos)", () => {
  const d = (s: string) => new Date(`${s}-03:00`);
  const stays = [
    { from: d("2026-11-01T22:00:00"), wardKind: "UTI adulto" },
    { from: d("2026-11-05T09:00:00"), wardKind: "Enfermaria" },
  ];
  // Viradas de 02, 03, 04 e 05/11 na UTI; 06/11 na enfermaria; alta em 06/11 à tarde.
  assert.deepEqual([...dailiesByWard(d("2026-11-01T22:00:00"), d("2026-11-06T15:00:00"), stays)], [["UTI adulto", 4], ["Enfermaria", 1]]);
  // Entrou e saiu no mesmo dia: uma diária, da ala onde estava.
  assert.deepEqual([...dailiesByWard(d("2026-11-01T08:00:00"), d("2026-11-01T18:00:00"), [{ from: d("2026-11-01T08:00:00"), wardKind: "UTI neonatal" }])], [["UTI neonatal", 1]]);
  // Ainda internado: conta até agora.
  const now = d("2026-11-03T12:00:00");
  assert.deepEqual([...dailiesByWard(d("2026-11-01T10:00:00"), null, [{ from: d("2026-11-01T10:00:00"), wardKind: "UTI pediátrica" }], now)], [["UTI pediátrica", 2]]);
});

test("lançamentos automáticos com os preços da tabela; sem preço fica zero", () => {
  const prices = new Map([["diaria:Enfermaria", 45000], ["med:p1", 450], ["exame:t1", 2500], ["sala:hora", 60000]]);
  const lines = autoLines(
    {
      admittedAt: new Date("2026-11-01T10:00:00-03:00"),
      dischargedAt: new Date("2026-11-04T10:00:00-03:00"),
      stays: [{ from: new Date("2026-11-01T10:00:00-03:00"), wardKind: "Enfermaria" }],
      medications: [{ productId: "p1", name: "Dipirona", unit: "ampola", quantity: 6 }, { productId: "p2", name: "Devolvido", unit: "ampola", quantity: 0 }],
      exams: [{ id: "e1", name: "Hemograma", at: new Date() }, { id: "e2", name: "Sem preço", at: new Date() }],
      surgeries: [{ id: "s1", procedure: "Apendicectomia", hours: 2 }],
    },
    prices,
    new Map([["e1", "t1"], ["e2", "t2"]]),
  );
  assert.deepEqual(lines.map((l) => [l.source, l.quantity, l.unitCents]), [
    ["diarias:Enfermaria", 3, 45000],
    ["med:p1", 6, 450],
    ["exame:e1", 1, 2500],
    ["exame:e2", 1, 0],
    ["cirurgia:s1", 2, 60000],
  ]);
  assert.equal(billTotal(lines), 3 * 45000 + 6 * 450 + 2500 + 2 * 60000);
});

test("a aba Contas hospitalares só aparece no hospital", () => {
  assert.equal(tabInInstitution("HOSPITAL", "contas"), true);
  assert.equal(tabInInstitution("CLINICA", "contas"), false);
});

async function admitted(label: string) {
  const slug = `ct-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: `Hospital ${label}`, slug, kind: "HOSPITAL" } });
  const user = await prisma.user.create({ data: { clinicId: clinic.id, name: "Médica", email: `${slug}@t.com`, passwordHash: "-", role: "PROFISSIONAL", councilNumber: "1", councilType: "CRM" } });
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente" } });
  const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: "Ala", kind: "Enfermaria" } });
  const bed = await prisma.bed.create({ data: { clinicId: clinic.id, wardId: ward.id, code: "1" } });
  const admission = await prisma.admission.create({ data: { clinicId: clinic.id, patientId: patient.id, bedId: bed.id, attendingId: user.id, admittedById: user.id, origin: "Eletiva" } });
  return { clinic, user, admission };
}

test("conta fechada não muda, não ganha nem perde itens, e não se apaga", async () => {
  const h = await admitted("a");
  const bill = await prisma.hospitalBill.create({ data: { clinicId: h.clinic.id, admissionId: h.admission.id, payer: "Particular" } });
  const base = { clinicId: h.clinic.id, billId: bill.id, kind: "TAXA" as const, description: "Taxa", quantity: 2, unitCents: 1000 };
  await assert.rejects(prisma.hospitalBillItem.create({ data: { ...base, totalCents: 1500 } }), /HospitalBillItem_valores/);
  const item = await prisma.hospitalBillItem.create({ data: { ...base, totalCents: 2000 } });
  await prisma.hospitalBill.update({ where: { id: bill.id }, data: { status: "FECHADA", totalCents: 2000, closedAt: new Date(), closedById: h.user.id } });
  await assert.rejects(prisma.hospitalBill.update({ where: { id: bill.id }, data: { totalCents: 1 } }), /fechada não pode ser alterada/);
  await assert.rejects(prisma.hospitalBillItem.update({ where: { id: item.id }, data: { description: "Outra" } }), /fechada não pode ser alterada/);
  await assert.rejects(prisma.hospitalBillItem.delete({ where: { id: item.id } }), /fechada não pode ser alterada/);
  await assert.rejects(prisma.hospitalBillItem.create({ data: { ...base, totalCents: 2000 } }), /fechada não pode ser alterada/);
  await assert.rejects(prisma.hospitalBill.delete({ where: { id: bill.id } }), /não podem ser excluídas/);
});

test("uma conta por internação e só da mesma instituição", async () => {
  const a = await admitted("b");
  const b = await admitted("c");
  await prisma.hospitalBill.create({ data: { clinicId: a.clinic.id, admissionId: a.admission.id, payer: "SUS" } });
  await assert.rejects(prisma.hospitalBill.create({ data: { clinicId: a.clinic.id, admissionId: a.admission.id, payer: "SUS" } }));
  await assert.rejects(prisma.hospitalBill.create({ data: { clinicId: a.clinic.id, admissionId: b.admission.id, payer: "SUS" } }));
});
