// Confere as travas do próprio banco de dados. Precisa do banco rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

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
