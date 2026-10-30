// Dados iniciais para testar o sistema: tabela CID-10, uma clínica de
// demonstração, usuários de cada perfil, modelos de atendimento e pacientes.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

async function seedCid10() {
  const file = readFileSync(path.join(__dirname, "data", "cid10.tsv"), "utf8");
  const rows = file
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, description] = line.split("\t");
      return { code, description };
    });
  for (let i = 0; i < rows.length; i += 2000) {
    await prisma.cid10.createMany({ data: rows.slice(i, i + 2000), skipDuplicates: true });
  }
  console.log(`CID-10: ${rows.length} códigos`);
}

const consultaGeral = [
  { key: "queixa", label: "Queixa principal", type: "textarea" },
  { key: "hda", label: "História da doença atual", type: "textarea" },
  { key: "exameFisico", label: "Exame físico", type: "textarea" },
  { key: "hipotese", label: "Hipóteses diagnósticas", type: "textarea" },
  { key: "conduta", label: "Conduta", type: "textarea" },
];

const retorno = [
  { key: "evolucao", label: "Evolução", type: "textarea" },
  { key: "exames", label: "Resultados de exames", type: "textarea" },
  { key: "conduta", label: "Conduta", type: "textarea" },
];

const psicologia = [
  { key: "demanda", label: "Demanda", type: "textarea" },
  { key: "registro", label: "Registro da sessão", type: "textarea" },
  { key: "encaminhamentos", label: "Encaminhamentos", type: "textarea" },
];

async function seedDemo() {
  const existing = await prisma.clinic.findUnique({ where: { slug: "demo" } });
  if (existing) return;

  const clinic = await prisma.clinic.create({ data: { name: "Clínica Demonstração", slug: "demo" } });
  const passwordHash = await bcrypt.hash("senha123", 10);

  await prisma.user.createMany({
    data: [
      { clinicId: clinic.id, name: "Administrador", email: "admin@demo.com", passwordHash, role: "ADMIN", sector: "Administração" },
      {
        clinicId: clinic.id,
        name: "Dra. Ana Souza",
        email: "ana@demo.com",
        passwordHash,
        role: "PROFISSIONAL",
        councilType: "CRM",
        councilNumber: "123456",
        councilUf: "SP",
        specialty: "Clínica médica",
        sector: "Consultório 1",
      },
      {
        clinicId: clinic.id,
        name: "Carlos Lima",
        email: "carlos@demo.com",
        passwordHash,
        role: "PROFISSIONAL",
        councilType: "CRP",
        councilNumber: "06/98765",
        councilUf: "SP",
        specialty: "Psicologia",
        sector: "Consultório 2",
      },
      { clinicId: clinic.id, name: "Júlia Recepção", email: "recepcao@demo.com", passwordHash, role: "RECEPCAO", sector: "Recepção" },
    ],
  });

  await prisma.recordTemplate.createMany({
    data: [
      { clinicId: clinic.id, name: "Consulta (primeira vez)", fields: consultaGeral },
      { clinicId: clinic.id, name: "Retorno", fields: retorno },
      { clinicId: clinic.id, name: "Sessão de psicologia", specialty: "Psicologia", fields: psicologia },
    ],
  });

  const ana = await prisma.user.findFirstOrThrow({ where: { clinicId: clinic.id, email: "ana@demo.com" } });
  await prisma.textSnippet.createMany({
    data: [
      {
        ownerId: ana.id,
        fieldKey: "exameFisico",
        title: "Exame físico normal",
        text: "Bom estado geral, corada, hidratada, acianótica, anictérica, afebril.\nACV: ritmo cardíaco regular em 2 tempos, bulhas normofonéticas, sem sopros.\nAR: murmúrio vesicular presente bilateralmente, sem ruídos adventícios.\nAbdome: plano, flácido, indolor à palpação, sem visceromegalias.",
      },
      {
        ownerId: ana.id,
        fieldKey: "conduta",
        title: "Orientações gerais e retorno",
        text: "Orientada quanto a sinais de alarme. Retorno em 30 dias ou antes, se necessário.",
      },
      { ownerId: ana.id, fieldKey: null, title: "Nega queixas", text: "Paciente nega queixas no momento." },
    ],
  });

  await prisma.patient.createMany({
    data: [
      {
        clinicId: clinic.id,
        name: "Maria Oliveira",
        birthDate: new Date("1975-04-12"),
        sex: "F",
        cpf: "11144477735",
        phone: "(11) 98888-1111",
        insurance: "Particular",
        allergies: "Dipirona",
        currentMedications: "Losartana 50 mg 1x/dia",
        personalHistory: "Hipertensão arterial desde 2015",
      },
      {
        clinicId: clinic.id,
        name: "João Pereira",
        birthDate: new Date("1990-09-30"),
        sex: "M",
        phone: "(11) 97777-2222",
        insurance: "Unimed",
        insuranceNumber: "0001234567",
      },
    ],
  });
  console.log("Clínica de demonstração criada (senha de todos: senha123)");
}

// Horário de Brasília (sem horário de verão): hora local + 3 = UTC.
function brasilia(daysFromToday: number, hour: number, minute = 0) {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromToday, hour + 3, minute));
}

// Horários de atendimento e algumas consultas na clínica de demonstração.
// Roda à parte, para aparecer também em quem já tinha a clínica criada.
async function seedAgenda() {
  const clinic = await prisma.clinic.findUnique({ where: { slug: "demo" } });
  if (!clinic || (await prisma.workHours.count({ where: { clinicId: clinic.id } })) > 0) return;

  const users = await prisma.user.findMany({ where: { clinicId: clinic.id } });
  const byEmail = (email: string) => users.find((u) => u.email === email)!;
  const ana = byEmail("ana@demo.com");
  const carlos = byEmail("carlos@demo.com");
  const recepcao = byEmail("recepcao@demo.com");

  const weekdays = [1, 2, 3, 4, 5];
  await prisma.workHours.createMany({
    data: [
      ...weekdays.flatMap((weekday) => [
        { clinicId: clinic.id, professionalId: ana.id, weekday, startMinute: 8 * 60, endMinute: 12 * 60, slotMinutes: 30 },
        { clinicId: clinic.id, professionalId: ana.id, weekday, startMinute: 14 * 60, endMinute: 18 * 60, slotMinutes: 30 },
      ]),
      ...weekdays.map((weekday) => ({ clinicId: clinic.id, professionalId: carlos.id, weekday, startMinute: 13 * 60, endMinute: 19 * 60, slotMinutes: 50 })),
    ],
  });

  const patients = await prisma.patient.findMany({ where: { clinicId: clinic.id } });
  const maria = patients.find((p) => p.name === "Maria Oliveira")!;
  const joao = patients.find((p) => p.name === "João Pereira")!;
  const extra = await Promise.all(
    [
      { name: "Fernanda Costa", phone: "(11) 96666-3333" },
      { name: "Roberto Alves", phone: "(11) 95555-4444", insurance: "Bradesco Saúde" },
      { name: "Luíza Martins", phone: "(11) 94444-5555" },
    ].map((data) => prisma.patient.create({ data: { ...data, clinicId: clinic.id } })),
  );
  const [fernanda, roberto, luiza] = extra;

  const appt = (professionalId: string, patientId: string, start: Date, minutes: number, rest: Record<string, unknown> = {}) => ({
    clinicId: clinic.id,
    professionalId,
    patientId,
    startsAt: start,
    endsAt: new Date(start.getTime() + minutes * 60_000),
    createdById: recepcao.id,
    ...rest,
  });
  await prisma.appointment.createMany({
    data: [
      appt(ana.id, maria.id, brasilia(0, 8), 30, { status: "ATENDIDO" as const }),
      appt(ana.id, joao.id, brasilia(0, 9), 30, { status: "CHEGOU" as const, arrivedAt: brasilia(0, 8, 50), type: "RETORNO" as const, insurance: "Unimed" }),
      appt(ana.id, fernanda.id, brasilia(0, 9, 30), 30, { status: "CONFIRMADO" as const }),
      appt(ana.id, roberto.id, brasilia(0, 10, 30), 30, { insurance: "Bradesco Saúde", notes: "Trazer exames de sangue" }),
      appt(ana.id, luiza.id, brasilia(0, 14), 60, { type: "PROCEDIMENTO" as const }),
      appt(ana.id, maria.id, brasilia(1, 8, 30), 30, { type: "RETORNO" as const }),
      appt(carlos.id, luiza.id, brasilia(0, 14), 50, { status: "CONFIRMADO" as const }),
      appt(carlos.id, fernanda.id, brasilia(0, 15, 40), 50, { status: "DESMARCADO" as const, cancelReason: "Paciente viajou" }),
      appt(carlos.id, roberto.id, brasilia(2, 13), 50, { insurance: "Bradesco Saúde" }),
    ],
  });
  await prisma.scheduleBlock.create({
    data: { clinicId: clinic.id, professionalId: ana.id, startsAt: brasilia(0, 11, 30), endsAt: brasilia(0, 12), reason: "Reunião" },
  });
  console.log("Agenda de demonstração criada");
}

async function main() {
  await seedCid10();
  await seedDemo();
  await seedAgenda();
}

main().finally(() => prisma.$disconnect());
