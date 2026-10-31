// Versão hospitalar: centro cirúrgico e CME. A parte do banco precisa dele rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { durationLabel, minutesBetween, missingChecklist, nextStep, overlaps } from "../src/lib/centro-cirurgico";
import { loadCode, packageExpiry, packageState } from "../src/lib/cme";
import { tabInInstitution } from "../src/lib/tabs";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

const at = (iso: string) => new Date(iso);
const none: Record<"patientInAt" | "anesthesiaAt" | "incisionAt" | "endAt" | "patientOutAt", Date | null> = { patientInAt: null, anesthesiaAt: null, incisionAt: null, endAt: null, patientOutAt: null };

test("sala não pode ter cirurgias que se cruzam", () => {
  assert.equal(overlaps(at("2026-11-02T11:00:00Z"), 90, at("2026-11-02T12:00:00Z"), 60), true);
  assert.equal(overlaps(at("2026-11-02T11:00:00Z"), 60, at("2026-11-02T12:00:00Z"), 60), false); // uma termina quando a outra começa
  assert.equal(overlaps(at("2026-11-02T13:00:00Z"), 30, at("2026-11-02T12:00:00Z"), 120), true);
});

test("tempos na ordem e cirurgia segura antes de anestesia, incisão e saída", () => {
  const t = { ...none };
  assert.equal(nextStep(t, true)?.key, "patientInAt");
  t.patientInAt = at("2026-11-02T11:00:00Z");
  const step = nextStep(t, true);
  assert.equal(step?.key, "anesthesiaAt");
  assert.equal(missingChecklist(step, [], true), "ENTRADA");
  assert.equal(missingChecklist(step, ["ENTRADA"], true), null);
  t.anesthesiaAt = at("2026-11-02T11:10:00Z");
  assert.equal(missingChecklist(nextStep(t, true), ["ENTRADA"], true), "PAUSA");
  // Anestesia local: pula o início da anestesia, mas a entrada vale antes da incisão.
  const local = { ...none, patientInAt: at("2026-11-02T11:00:00Z") };
  assert.equal(nextStep(local, false)?.key, "incisionAt");
  assert.equal(missingChecklist(nextStep(local, false), [], false), "ENTRADA");
  const end = { ...t, incisionAt: at("2026-11-02T11:30:00Z"), endAt: at("2026-11-02T12:45:00Z") };
  assert.equal(missingChecklist(nextStep(end, true), ["ENTRADA", "PAUSA"], true), "SAIDA");
  assert.equal(nextStep({ ...end, patientOutAt: at("2026-11-02T13:00:00Z") }, true), null);
  assert.equal(durationLabel(minutesBetween(end.incisionAt, end.endAt)), "1h15");
  assert.equal(durationLabel(45), "45 min");
});

test("CME: pacote só disponível com carga liberada e dentro da validade", () => {
  const now = at("2026-11-02T12:00:00Z");
  const pkg = { expiresAt: at("2026-11-20T02:59:59Z"), usedAt: null, discardedAt: null };
  assert.equal(packageState(pkg, { result: "PENDENTE" }, now), "AGUARDANDO");
  assert.equal(packageState(pkg, { result: "LIBERADA" }, now), "DISPONIVEL");
  assert.equal(packageState(pkg, { result: "RECOLHIDA" }, now), "BLOQUEADO");
  assert.equal(packageState({ ...pkg, expiresAt: at("2026-11-04T02:59:59Z") }, { result: "LIBERADA" }, now), "VENCE_EM_BREVE");
  assert.equal(packageState({ ...pkg, expiresAt: at("2026-11-01T02:59:59Z") }, { result: "LIBERADA" }, now), "VENCIDO");
  assert.equal(packageState({ ...pkg, usedAt: now }, { result: "RECOLHIDA" }, now), "USADO");
  // Esterilizado 02/11 às 9h (Brasília) com validade de 30 dias: vale até 02/12 23:59 de Brasília.
  assert.equal(packageExpiry(at("2026-11-02T12:00:00Z"), 30).toISOString(), "2026-12-03T02:59:59.000Z");
  assert.equal(loadCode("Autoclave 1", at("2026-11-02T12:00:00Z"), 3), "AUTOCL-20261102-03");
});

test("as abas Centro cirúrgico e CME só aparecem no hospital", () => {
  for (const tab of ["centro-cirurgico", "cme"] as const) {
    assert.equal(tabInInstitution("HOSPITAL", tab), true);
    assert.equal(tabInInstitution("CLINICA", tab), false);
  }
});

async function hospital(label: string) {
  const slug = `cc-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: `Hospital ${label}`, slug, kind: "HOSPITAL" } });
  const user = await prisma.user.create({ data: { clinicId: clinic.id, name: "Cirurgiã", email: `${slug}@t.com`, passwordHash: "-", role: "PROFISSIONAL", councilNumber: "1", councilType: "CRM" } });
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente" } });
  const room = await prisma.operatingRoom.create({ data: { clinicId: clinic.id, name: "Sala 1" } });
  const surgery = await prisma.surgery.create({ data: { clinicId: clinic.id, patientId: patient.id, roomId: room.id, surgeonId: user.id, createdById: user.id, procedure: "Hérnia", scheduledAt: new Date(), expectedMinutes: 60 } });
  const kit = await prisma.cmeKit.create({ data: { clinicId: clinic.id, name: "Caixa" } });
  const load = await prisma.sterilizationLoad.create({ data: { clinicId: clinic.id, code: "C1", method: "VAPOR", equipment: "Autoclave", operatorId: user.id } });
  const pkg = await prisma.sterilePackage.create({ data: { clinicId: clinic.id, loadId: load.id, kitId: kit.id, expiresAt: new Date(Date.now() + 86_400_000) } });
  return { clinic, user, patient, room, surgery, kit, load, pkg };
}

test("checklist da cirurgia segura: um por etapa e não muda", async () => {
  const h = await hospital("a");
  const data = { clinicId: h.clinic.id, surgeryId: h.surgery.id, phase: "ENTRADA" as const, answers: [], doneById: h.user.id };
  const c = await prisma.surgeryChecklist.create({ data });
  await assert.rejects(prisma.surgeryChecklist.create({ data }), /Unique constraint/);
  await assert.rejects(prisma.surgeryChecklist.update({ where: { id: c.id }, data: { note: "x" } }), /não podem ser alterados/);
  await assert.rejects(prisma.surgery.delete({ where: { id: h.surgery.id } }), /não podem ser excluídos/);
});

test("carga: resultado só na ordem certa (pendente, liberada, recolhida)", async () => {
  const h = await hospital("b");
  await assert.rejects(prisma.sterilizationLoad.update({ where: { id: h.load.id }, data: { result: "RECOLHIDA" } }), /não pode passar de PENDENTE para RECOLHIDA/);
  await assert.rejects(prisma.sterilizationLoad.update({ where: { id: h.load.id }, data: { equipment: "Outra" } }), /não podem ser alterados/);
  await prisma.sterilizationLoad.update({ where: { id: h.load.id }, data: { result: "LIBERADA", chemicalOk: true, biologicalOk: true } });
  await prisma.sterilizationLoad.update({ where: { id: h.load.id }, data: { result: "RECOLHIDA" } });
  await assert.rejects(prisma.sterilizationLoad.update({ where: { id: h.load.id }, data: { result: "LIBERADA" } }), /não pode passar/);
  await assert.rejects(prisma.sterilizationLoad.delete({ where: { id: h.load.id } }), /não podem ser excluídas/);
});

test("pacote: usado uma vez numa cirurgia, nunca usado e descartado", async () => {
  const h = await hospital("c");
  await assert.rejects(prisma.sterilePackage.update({ where: { id: h.pkg.id }, data: { expiresAt: new Date(Date.now() + 9e9) } }), /não podem ser alterados/);
  await prisma.sterilePackage.update({ where: { id: h.pkg.id }, data: { surgeryId: h.surgery.id, usedAt: new Date(), usedById: h.user.id } });
  await assert.rejects(prisma.sterilePackage.update({ where: { id: h.pkg.id }, data: { surgeryId: null } }), /já usado não muda/);
  await assert.rejects(prisma.sterilePackage.update({ where: { id: h.pkg.id }, data: { discardedAt: new Date() } }), /SterilePackage_destino/);
  await assert.rejects(prisma.sterilePackage.delete({ where: { id: h.pkg.id } }), /não podem ser excluídos/);
});

test("cirurgia e pacote não aceitam ligação com outra instituição", async () => {
  const a = await hospital("d");
  const b = await hospital("e");
  await assert.rejects(
    prisma.surgery.create({ data: { clinicId: a.clinic.id, patientId: a.patient.id, roomId: b.room.id, surgeonId: a.user.id, createdById: a.user.id, procedure: "X", scheduledAt: new Date(), expectedMinutes: 60 } }),
    /outra clínica/,
  );
  await assert.rejects(prisma.sterilePackage.update({ where: { id: a.pkg.id }, data: { surgeryId: b.surgery.id, usedAt: new Date() } }), /outra clínica/);
});
