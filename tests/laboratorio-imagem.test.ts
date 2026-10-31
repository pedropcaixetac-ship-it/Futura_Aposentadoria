// Versão hospitalar: laboratório e imagem. A parte do banco precisa dele rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { fieldsToText, flag, parseFields, queueOrder, referenceLabel } from "../src/lib/exames";
import { tabInInstitution } from "../src/lib/tabs";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

test("campos do resultado digitados um por linha", () => {
  const fields = parseFields("Hemoglobina; g/dL; 12; 16\nPCR; mg/L; ; 5\nResultado");
  assert.deepEqual(fields, [
    { name: "Hemoglobina", unit: "g/dL", min: 12, max: 16 },
    { name: "PCR", unit: "mg/L", min: null, max: 5 },
    { name: "Resultado", unit: "", min: null, max: null },
  ]);
  assert.equal(parseFields("Sódio; mEq/L; 145; 135"), null); // mínimo maior que o máximo
  assert.equal(parseFields("Sódio; mEq/L; abc; 145"), null);
  assert.equal(parseFields("Potássio; mEq/L; 3,5; 5,1")?.[0].min, 3.5);
  assert.equal(fieldsToText(fields!), "Hemoglobina; g/dL; 12; 16\nPCR; mg/L; ; 5\nResultado; ; ; ");
});

test("valor fora da referência fica marcado; texto não", () => {
  assert.equal(flag({ value: "14500", min: 4000, max: 11000 }), "ALTO");
  assert.equal(flag({ value: "3,2", min: 3.5, max: 5.1 }), "BAIXO");
  assert.equal(flag({ value: "4,0", min: 3.5, max: 5.1 }), null);
  assert.equal(flag({ value: "Negativo", min: null, max: null }), null);
  assert.equal(referenceLabel({ min: null, max: 5, unit: "mg/L" }), "até 5");
  assert.equal(referenceLabel({ min: 3.5, max: 5.1, unit: "" }), "3,5 a 5,1");
});

test("fila: urgente primeiro, depois o mais antigo", () => {
  const e = (priority: "ROTINA" | "URGENTE", h: number) => ({ priority, scheduledAt: null, createdAt: new Date(Date.UTC(2026, 10, 2, h)) });
  const list = [e("ROTINA", 8), e("URGENTE", 10), e("ROTINA", 7), e("URGENTE", 9)].sort(queueOrder);
  assert.deepEqual(list.map((x) => `${x.priority}${x.createdAt.getUTCHours()}`), ["URGENTE9", "URGENTE10", "ROTINA7", "ROTINA8"]);
});

test("as abas Laboratório, Imagem e Agendar exames só aparecem no hospital", () => {
  for (const tab of ["laboratorio", "imagem", "exames"] as const) {
    assert.equal(tabInInstitution("HOSPITAL", tab), true);
    assert.equal(tabInInstitution("CLINICA", tab), false);
  }
});

async function hospital(label: string) {
  const slug = `ex-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: `Hospital ${label}`, slug, kind: "HOSPITAL" } });
  const user = await prisma.user.create({ data: { clinicId: clinic.id, name: "Médica", email: `${slug}@t.com`, passwordHash: "-", role: "PROFISSIONAL", councilNumber: "1", councilType: "CRM" } });
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente" } });
  const type = await prisma.examType.create({ data: { clinicId: clinic.id, sector: "LABORATORIO", name: "Hemograma", fields: [] } });
  return { clinic, user, patient, type };
}

test("pedido precisa de quem pediu e, laudado, não muda nem some", async () => {
  const h = await hospital("a");
  const base = { clinicId: h.clinic.id, patientId: h.patient.id, examTypeId: h.type.id, createdById: h.user.id };
  await assert.rejects(prisma.examRequest.create({ data: base }), /ExamRequest_solicitante/);
  const exam = await prisma.examRequest.create({ data: { ...base, externalRequester: "Dr. Fora, CRM 1" } });
  await prisma.examRequest.update({ where: { id: exam.id }, data: { status: "COLETADO", collectedAt: new Date() } });
  await prisma.examRequest.update({ where: { id: exam.id }, data: { status: "LAUDADO", values: [{ name: "Hb", value: "13" }], resultAt: new Date(), resultById: h.user.id } });
  await assert.rejects(prisma.examRequest.update({ where: { id: exam.id }, data: { values: [{ name: "Hb", value: "9" }] } }), /já laudado ou cancelado/);
  await assert.rejects(prisma.examRequest.delete({ where: { id: exam.id } }), /não podem ser excluídos/);
});

test("pedido não troca de paciente e não aceita exame de outra instituição", async () => {
  const a = await hospital("b");
  const b = await hospital("c");
  const exam = await prisma.examRequest.create({ data: { clinicId: a.clinic.id, patientId: a.patient.id, examTypeId: a.type.id, requestedById: a.user.id, createdById: a.user.id } });
  const other = await prisma.patient.create({ data: { clinicId: a.clinic.id, name: "Outro" } });
  await assert.rejects(prisma.examRequest.update({ where: { id: exam.id }, data: { patientId: other.id } }), /trocar de paciente/);
  await assert.rejects(
    prisma.examRequest.create({ data: { clinicId: a.clinic.id, patientId: a.patient.id, examTypeId: b.type.id, requestedById: a.user.id, createdById: a.user.id } }),
    /outra clínica/,
  );
});
