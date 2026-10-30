// Uma clínica nunca pode enxergar nem misturar dados de outra.
// A parte do banco precisa dele rodando (DATABASE_URL), como banco.test.ts.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

const root = path.join(__dirname, "..");
const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
const models = new Map([...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => [m[1], m[2]]));
// Modelos que pertencem a uma clínica (têm clinicId obrigatório).
const scoped = new Set([...models].filter(([, body]) => /^\s+clinicId\s+String\s/m.test(body)).map(([name]) => name));

// Ligações entre dois modelos de clínica, por exemplo Appointment.patientId -> Patient.
function scopedRelations() {
  const pairs: { table: string; column: string; parent: string }[] = [];
  for (const table of scoped) {
    for (const m of models.get(table)!.matchAll(/^\s+\w+\s+(\w+)\??\s+@relation\((?:"\w+",\s*)?(?:name:\s*"\w+",\s*)?fields:\s*\[(\w+)\]/gm)) {
      if (scoped.has(m[1]) && m[2] !== "clinicId") pairs.push({ table, column: m[2], parent: m[1] });
    }
  }
  return pairs;
}

async function testClinic(label: string) {
  const slug = `iso-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: `Clínica ${label}`, slug } });
  const professional = await prisma.user.create({
    data: { clinicId: clinic.id, name: `Profissional ${label}`, email: `${slug}@t.com`, passwordHash: "-", role: "PROFISSIONAL" },
  });
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, name: `Paciente ${label}` } });
  return { clinic, professional, patient };
}

test("toda ligação entre dados de clínica tem a trava de mesma clínica no banco", async () => {
  const rows = await prisma.$queryRaw<{ table: string; args: string }[]>`
    SELECT c.relname AS table, encode(t.tgargs, 'escape') AS args
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname LIKE '%_mesma_clinica'`;
  const covered = new Set<string>();
  for (const row of rows) {
    const args = row.args.split("\\000").filter(Boolean);
    for (let i = 0; i < args.length; i += 2) covered.add(`${row.table}.${args[i]}->${args[i + 1]}`);
  }
  const missing = scopedRelations()
    .map((r) => `${r.table}.${r.column}->${r.parent}`)
    .filter((key) => !covered.has(key));
  // Se falhar: inclua a ligação nova numa migração com conferir_mesma_clinica (ver 20261030200000_mesma_clinica).
  assert.deepEqual(missing, []);
});

test("banco recusa consulta, atendimento e cobrança ligados a paciente de outra clínica", async () => {
  const a = await testClinic("a");
  const b = await testClinic("b");
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

  await assert.rejects(
    prisma.appointment.create({ data: { clinicId: a.clinic.id, patientId: b.patient.id, professionalId: a.professional.id, createdById: a.professional.id, startsAt, endsAt } }),
    /outra clínica/,
  );
  await assert.rejects(
    prisma.encounter.create({ data: { clinicId: a.clinic.id, patientId: a.patient.id, professionalId: b.professional.id, fields: [] } }),
    /outra clínica/,
  );
  await assert.rejects(
    prisma.charge.create({ data: { clinicId: a.clinic.id, patientId: b.patient.id, description: "Consulta", amountCents: 10000, dueDate: startsAt } }),
    /outra clínica/,
  );

  // Dentro da mesma clínica continua funcionando, e mudar o paciente para o de outra clínica é recusado.
  const appointment = await prisma.appointment.create({
    data: { clinicId: a.clinic.id, patientId: a.patient.id, professionalId: a.professional.id, createdById: a.professional.id, startsAt, endsAt },
  });
  await assert.rejects(prisma.appointment.update({ where: { id: appointment.id }, data: { patientId: b.patient.id } }), /outra clínica/);
  await prisma.appointment.update({ where: { id: appointment.id }, data: { cancelReason: "teste" } });
});

// Telas que listam ou contam dados precisam filtrar pela clínica de quem está usando.
// Este teste lê o código e acusa consultas novas sem clinicId. As exceções abaixo foram conferidas uma a uma.
const REVIEWED = new Map([
  ["src/app/teleconsulta/[token]/actions.ts|teleconsultation.updateMany", "pela teleconsulta já achada pelo link"],
  ["src/app/painel/(area)/registro/page.tsx|platformAuditLog.findMany", "registro da própria empresa, só no Painel do dono"],
  ["src/app/(app)/auditoria/page.tsx|auditLog.findMany", "filtro 'where' montado com clinicId"],
  ["src/app/(app)/auditoria/page.tsx|auditLog.count", "filtro 'where' montado com clinicId"],
  ["src/app/(app)/agenda/actions.ts|teleconsultation.updateMany", "pelo agendamento já conferido na clínica"],
  ["src/app/(app)/contabilidade/obrigacoes/page.tsx|expense.findMany", "ids vindos das obrigações da clínica"],
  ["src/app/(app)/meu-financeiro/page.tsx|charge.findMany", "filtro 'paidInMonth' com clinicId"],
  ["src/app/(app)/servidores/page.tsx|user.findMany", "filtro 'where' montado com clinicId"],
  ["src/app/(app)/pacientes/[id]/actions.ts|appointment.updateMany", "pelo atendimento já conferido na clínica"],
  ["src/app/(app)/financeiro/repasse/page.tsx|charge.groupBy", "filtro 'paidInMonth' com clinicId"],
  ["src/app/(app)/financeiro/receitas/page.tsx|charge.findMany", "filtro 'where' montado com clinicId"],
  ["src/lib/templates.ts|recordTemplate.findMany", "usableWhere() com clinicId"],
  ["src/lib/teleconsulta-sala.ts|teleconsultation.updateMany", "pela teleconsulta já achada na clínica"],
  ["src/app/(app)/financeiro/faturamento/actions.ts|insuranceClaim.findFirst", "pelo atendimento já conferido na clínica"],
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

test("consultas que listam dados de clínica filtram pela clínica", () => {
  const names = new Set([...scoped].map((m) => m[0].toLowerCase() + m.slice(1)));
  const found: string[] = [];
  for (const file of sourceFiles(path.join(root, "src"))) {
    const code = readFileSync(file, "utf8");
    const rel = path.relative(root, file).split(path.sep).join("/");
    for (const m of code.matchAll(/(?:prisma|tx)\.(\w+)\.(findMany|findFirst|findFirstOrThrow|count|groupBy|aggregate|updateMany|deleteMany)\(/g)) {
      if (!names.has(m[1])) continue;
      // Pega o trecho entre os parênteses da chamada.
      let depth = 0;
      let end = m.index! + m[0].length - 1;
      for (; end < code.length; end++) {
        if (code[end] === "(") depth++;
        if (code[end] === ")" && --depth === 0) break;
      }
      if (code.slice(m.index!, end).includes("clinicId")) continue;
      const key = `${rel}|${m[1]}.${m[2]}`;
      if (!REVIEWED.has(key)) found.push(`${key} (linha ${code.slice(0, m.index).split("\n").length})`);
    }
  }
  // Se falhar: inclua clinicId no filtro, ou confira o caso e acrescente em REVIEWED com o motivo.
  assert.deepEqual(found, []);
});
