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
      { clinicId: clinic.id, name: "Administrador", email: "admin@demo.com", passwordHash, role: "ADMIN" },
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
      },
      { clinicId: clinic.id, name: "Júlia Recepção", email: "recepcao@demo.com", passwordHash, role: "RECEPCAO" },
    ],
  });

  await prisma.recordTemplate.createMany({
    data: [
      { clinicId: clinic.id, name: "Consulta (primeira vez)", fields: consultaGeral },
      { clinicId: clinic.id, name: "Retorno", fields: retorno },
      { clinicId: clinic.id, name: "Sessão de psicologia", specialty: "Psicologia", fields: psicologia },
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

async function main() {
  await seedCid10();
  await seedDemo();
}

main().finally(() => prisma.$disconnect());
