// Assinatura ICP dos registros do hospital: prescrição do dia, enfermagem e os demais.
// A parte do banco precisa dele rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { isRecordSigned, loadHospitalRecord, loadHospitalRecordForViewer, pendingHospitalRecords, recordHash } from "../src/lib/signature/hospital";
import { hospitalTarget, isSafeBack, signTarget } from "../src/lib/signature/service";
import { dayKey, prescriptionDayEnd, prescriptionDayOf } from "../src/lib/prescricao";
import type { CurrentUser } from "../src/lib/auth";

after(() => prisma.$disconnect());

test("o resumo do conteúdo muda quando o registro muda", () => {
  const a = recordHash({ title: "Prescrição", info: ["Paciente: A"], sections: [{ text: "1. Dipirona" }] });
  assert.equal(a, recordHash({ title: "Prescrição", info: ["Paciente: A"], sections: [{ text: "1. Dipirona" }] }));
  assert.notEqual(a, recordHash({ title: "Prescrição", info: ["Paciente: A"], sections: [{ text: "1. Dipirona\n2. Ondansetrona" }] }));
});

test("só volta para telas do sistema depois de assinar", () => {
  assert.ok(isSafeBack("/assinatura/pendentes"));
  assert.ok(isSafeBack("/internacao/abc123/prescricao"));
  assert.ok(isSafeBack("/pronto-socorro/abc123"));
  assert.ok(!isSafeBack("https://exemplo.com"));
  assert.ok(!isSafeBack("//exemplo.com/internacao/1"));
});

async function hospital() {
  const slug = `ass-${randomUUID().slice(0, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: `Hospital ${slug}`, slug, kind: "HOSPITAL" } });
  const mk = (name: string, councilType: string, cpf: string) =>
    prisma.user.create({ data: { clinicId: clinic.id, name, email: `${name}-${slug}@t.com`, passwordHash: "-", role: "PROFISSIONAL", councilType, councilNumber: "123", cpf }, include: { clinic: { include: { plan: true } } } });
  const doctor = await mk("Medica", "CRM", "12345678909");
  const nurse = await mk("Enfermeira", "COREN", "98765432100");
  const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: "Enfermaria" } });
  const bed = await prisma.bed.create({ data: { clinicId: clinic.id, wardId: ward.id, code: "1" } });
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente Teste" } });
  const admission = await prisma.admission.create({ data: { clinicId: clinic.id, patientId: patient.id, bedId: bed.id, attendingId: doctor.id, admittedById: doctor.id, origin: "Pronto-socorro" } });
  return { clinic, doctor, nurse, patient, admission };
}

test("prescrição do dia: fica pendente, assina, e volta a ficar pendente se ganhar item novo", async () => {
  const h = await hospital();
  const startAt = new Date();
  const item = (description: string) =>
    prisma.prescriptionItem.create({
      data: { clinicId: h.clinic.id, patientId: h.patient.id, admissionId: h.admission.id, prescriberId: h.doctor.id, description, route: "Oral", intervalHours: 8, startAt, endAt: prescriptionDayEnd(startAt) },
    });
  const first = await item("Dipirona 500 mg");
  const key = `internacao:${h.admission.id}:${dayKey(prescriptionDayOf(first))}:${h.doctor.id}`;

  let pending = await pendingHospitalRecords(h.doctor);
  assert.deepEqual(pending.map((r) => [r.type, r.key]), [["prescricao", key]]);
  // A enfermeira não assina a prescrição da médica.
  assert.equal(await loadHospitalRecord(h.nurse, "prescricao", key), null);
  assert.equal(await loadHospitalRecord(h.nurse, "prescricao", key.replace(h.doctor.id, h.nurse.id)), null);
  // Mas consegue ver o PDF (como a médica escreveu).
  assert.match((await loadHospitalRecordForViewer(h.clinic.id, "prescricao", key))?.input.professional?.name ?? "", /Medica/);

  const user = h.doctor as unknown as CurrentUser;
  // Fora de uma requisição o registro de auditoria não acha o IP; o PDF assinado já foi gravado antes dele.
  await signTarget(user, hospitalTarget("prescricao", key), "TESTE").catch((e) => {
    if (!/headers/.test(String(e))) throw e;
  });
  const signed = await prisma.signedPdf.findFirst({ where: { clinicId: h.clinic.id, recordType: "prescricao", recordKey: key } });
  assert.ok(signed && signed.pdf.length > 1000);
  pending = await pendingHospitalRecords(h.doctor);
  assert.equal(pending.length, 0);

  await item("Ondansetrona 4 mg");
  const record = await loadHospitalRecord(h.doctor, "prescricao", key);
  assert.ok(record);
  assert.equal(await isRecordSigned(h.clinic.id, record), false);
  assert.equal((await pendingHospitalRecords(h.doctor)).length, 1);
});

test("enfermagem do dia: checagem e sinais vitais entram no mesmo registro da enfermeira", async () => {
  const h = await hospital();
  const startAt = new Date(Date.now() - 3600_000);
  const rx = await prisma.prescriptionItem.create({
    data: { clinicId: h.clinic.id, patientId: h.patient.id, admissionId: h.admission.id, prescriberId: h.doctor.id, description: "Dipirona", route: "Oral", intervalHours: 8, startAt, endAt: prescriptionDayEnd(startAt) },
  });
  await prisma.medicationCheck.create({ data: { clinicId: h.clinic.id, itemId: rx.id, scheduledAt: startAt, status: "FEITO", recordedById: h.nurse.id } });
  await prisma.vitalRecord.create({ data: { clinicId: h.clinic.id, admissionId: h.admission.id, takenAt: new Date(), vitals: { pa_sis: 120, pa_dia: 80 }, recordedById: h.nurse.id } });
  const pending = await pendingHospitalRecords(h.nurse);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].type, "enfermagem");
  assert.deepEqual(pending[0].input.sections.map((s) => s.title), ["Checagem da prescrição", "Sinais vitais"]);
});
