// Corridas: muita gente pegando o mesmo horário no mesmo segundo. Precisa do banco rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { slotTaken, withLock } from "../src/lib/lock";

after(() => prisma.$disconnect());

async function scenario() {
  const slug = `teste-trava-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: "Clínica de teste", slug } });
  const professional = await prisma.user.create({ data: { clinicId: clinic.id, name: "Médica", email: "m@t.com", passwordHash: "-", role: "PROFISSIONAL" } });
  const patients = await Promise.all(
    Array.from({ length: 30 }, (_, i) => prisma.patient.create({ data: { clinicId: clinic.id, name: `Paciente ${i}` } })),
  );
  return { clinic, professional, patients };
}

test("30 pessoas marcando o mesmo horário ao mesmo tempo: só uma consegue", async () => {
  const { clinic, professional, patients } = await scenario();
  const start = new Date("2030-01-10T13:00:00Z");
  const end = new Date("2030-01-10T13:15:00Z");
  const results = await Promise.all(
    patients.map((p) =>
      withLock([`agenda:${professional.id}`], async (tx) => {
        if (await slotTaken(tx, { clinicId: clinic.id, professionalId: professional.id, start, end })) return false;
        await tx.appointment.create({ data: { clinicId: clinic.id, professionalId: professional.id, patientId: p.id, startsAt: start, endsAt: end } });
        return true;
      }),
    ),
  );
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await prisma.appointment.count({ where: { clinicId: clinic.id } }), 1);
});

test("horário desmarcado volta a ficar livre; outro horário não atrapalha", async () => {
  const { clinic, professional, patients } = await scenario();
  const at = (h: number) => new Date(`2030-01-10T${String(h).padStart(2, "0")}:00:00Z`);
  const cancelled = await prisma.appointment.create({
    data: { clinicId: clinic.id, professionalId: professional.id, patientId: patients[0].id, startsAt: at(13), endsAt: at(14), status: "DESMARCADO" },
  });
  const other = await prisma.appointment.create({
    data: { clinicId: clinic.id, professionalId: professional.id, patientId: patients[1].id, startsAt: at(14), endsAt: at(15) },
  });
  const check = (start: Date, end: Date, exceptId?: string) =>
    withLock([`agenda:${professional.id}`], (tx) => slotTaken(tx, { clinicId: clinic.id, professionalId: professional.id, start, end, exceptId }));
  assert.equal(await check(at(13), at(14)), null);
  assert.equal((await check(at(13), at(15)))?.patient.name, "Paciente 1");
  // Remarcar a própria consulta para um horário que encosta nela mesma não conta como ocupado.
  assert.equal(await check(at(14), at(15), other.id), null);
  assert.ok(cancelled);
});
