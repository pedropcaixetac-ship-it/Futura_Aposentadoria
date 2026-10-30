// Confere as travas do próprio banco de dados. Precisa do banco rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { patientNameWhere } from "../src/lib/patient";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

// Cada execução usa uma clínica própria, para não misturar com os dados de demonstração.
function testClinic() {
  const slug = `teste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.clinic.create({ data: { name: "Clínica de teste", slug } });
}

test("atendimento finalizado não pode ser alterado nem excluído", async () => {
  const clinic = await testClinic();
  const professional = await prisma.user.create({
    data: { clinicId: clinic.id, name: "Teste", email: "t@t.com", passwordHash: "-", role: "PROFISSIONAL" },
  });
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente Teste" } });

  const encounter = await prisma.encounter.create({
    data: { clinicId: clinic.id, patientId: patient.id, professionalId: professional.id, fields: [] },
  });
  await prisma.encounter.update({ where: { id: encounter.id }, data: { content: { a: "rascunho" } } });
  await prisma.encounter.update({ where: { id: encounter.id }, data: { status: "FINALIZADO", finalizedAt: new Date() } });

  await assert.rejects(prisma.encounter.update({ where: { id: encounter.id }, data: { content: { a: "mudado" } } }), /finalizado/);
  await assert.rejects(prisma.encounter.delete({ where: { id: encounter.id } }), /excluídos/);
});

test("auditoria não pode ser apagada", async () => {
  const clinic = await testClinic();
  const log = await prisma.auditLog.create({ data: { clinicId: clinic.id, action: "TESTE", entity: "Teste" } });
  await assert.rejects(prisma.auditLog.delete({ where: { id: log.id } }), /não podem ser alterados/);
});

test("número do recibo não se repete na mesma clínica", async () => {
  const clinic = await testClinic();
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente Teste" } });
  const charge = (n: number) => ({ clinicId: clinic.id, patientId: patient.id, description: "Consulta", amountCents: 100, dueDate: new Date(), receiptNumber: n });
  await prisma.charge.create({ data: charge(1) });
  await assert.rejects(prisma.charge.create({ data: charge(1) }), /Unique constraint/);
});

test("documento emitido (receita, atestado) não pode ser alterado nem excluído", async () => {
  const clinic = await testClinic();
  const professional = await prisma.user.create({
    data: { clinicId: clinic.id, name: "Teste", email: "t@t.com", passwordHash: "-", role: "PROFISSIONAL" },
  });
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente Teste" } });
  const encounter = await prisma.encounter.create({
    data: { clinicId: clinic.id, patientId: patient.id, professionalId: professional.id, fields: [] },
  });
  const doc = await prisma.clinicalDocument.create({
    data: {
      clinicId: clinic.id,
      encounterId: encounter.id,
      patientId: patient.id,
      authorId: professional.id,
      type: "ATESTADO",
      body: "Atesto que...",
      contentHash: "-",
    },
  });

  await assert.rejects(prisma.clinicalDocument.update({ where: { id: doc.id }, data: { body: "mudado" } }), /não podem ser alterados/);
  await assert.rejects(prisma.clinicalDocument.delete({ where: { id: doc.id } }), /não podem ser alterados/);
});

test("PDF assinado não pode ser alterado nem excluído", async () => {
  const clinic = await testClinic();
  const professional = await prisma.user.create({
    data: { clinicId: clinic.id, name: "Teste", email: "t@t.com", passwordHash: "-", role: "PROFISSIONAL" },
  });
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: "Paciente Teste" } });
  const signed = await prisma.signedPdf.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      signerId: professional.id,
      provider: "TESTE",
      signerName: "Teste",
      certificateSerial: "01",
      pdf: new Uint8Array([1, 2, 3]),
      sha256: "-",
    },
  });
  await assert.rejects(prisma.signedPdf.update({ where: { id: signed.id }, data: { signerName: "Outro" } }), /não podem ser alterados/);
  await assert.rejects(prisma.signedPdf.delete({ where: { id: signed.id } }), /não podem ser alterados/);
});

test("busca de paciente não liga para acentos nem maiúsculas", async () => {
  const clinic = await testClinic();
  await prisma.patient.create({ data: { clinicId: clinic.id, name: "José da Conceição Gonçalves", socialName: "Zé Ângelo" } });
  const find = (term: string) => prisma.patient.count({ where: { clinicId: clinic.id, ...patientNameWhere(term) } });
  assert.equal(await find("jose"), 1);
  assert.equal(await find("CONCEICAO GONC"), 1);
  assert.equal(await find("Gonçalves"), 1);
  assert.equal(await find("ze angelo"), 1);
  assert.equal(await find("maria"), 0);
});
