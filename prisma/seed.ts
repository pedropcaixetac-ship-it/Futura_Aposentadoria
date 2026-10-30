// Dados iniciais para testar o sistema: tabela CID-10, uma clínica de
// demonstração, usuários de cada perfil, modelos de atendimento e pacientes.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { encounterHash } from "../src/lib/record";
import { dateInput } from "../src/lib/finance";
import { defaultObligations, obligationDueDate } from "../src/lib/accounting";

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
        phone: "11988881111",
        registrationComplete: true,
        insurance: "Particular",
        allergies: "Dipirona",
        currentMedications: "Losartana 50 mg 1x/dia",
        personalHistory: "Hipertensão arterial desde 2015",
        whatsappOptIn: true,
        whatsappOptInAt: new Date(),
      },
      {
        clinicId: clinic.id,
        name: "João Pereira",
        birthDate: new Date("1990-09-30"),
        sex: "M",
        phone: "11977772222",
        registrationComplete: false,
        insurance: "Unimed",
        insuranceNumber: "0001234567",
      },
    ],
  });
  console.log("Clínica de demonstração criada (senha de todos: senha123)");
}

// Exemplos do financeiro na clínica de demonstração. Roda à parte do resto
// para que clínicas de demonstração já existentes também recebam os exemplos.
async function seedFinanceDemo() {
  const clinic = await prisma.clinic.findUnique({ where: { slug: "demo" } });
  if (!clinic || (await prisma.priceItem.count({ where: { clinicId: clinic.id } })) > 0) return;

  const day = (offset: number) => {
    const iso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    return new Date(new Date(`${iso}T00:00:00Z`).getTime() + offset * 86400000);
  };
  const ana = await prisma.user.findFirst({ where: { clinicId: clinic.id, email: "ana@demo.com" } });
  const carlos = await prisma.user.findFirst({ where: { clinicId: clinic.id, email: "carlos@demo.com" } });
  const maria = await prisma.patient.findFirst({ where: { clinicId: clinic.id, name: "Maria Oliveira" } });
  const joao = await prisma.patient.findFirst({ where: { clinicId: clinic.id, name: "João Pereira" } });
  if (!ana || !carlos || !maria || !joao) return;

  await prisma.clinic.update({ where: { id: clinic.id }, data: { address: "Rua Exemplo, 100, Centro - Goiânia", phone: "(62) 3333-4444" } });
  await prisma.user.update({ where: { id: ana.id }, data: { commissionPercent: 60 } });
  await prisma.user.update({ where: { id: carlos.id }, data: { commissionPercent: 70 } });

  await prisma.priceItem.createMany({
    data: [
      { clinicId: clinic.id, name: "Consulta clínica geral", priceCents: 25000 },
      { clinicId: clinic.id, name: "Retorno", priceCents: 15000 },
      { clinicId: clinic.id, name: "Sessão de psicologia", priceCents: 18000 },
      { clinicId: clinic.id, name: "Eletrocardiograma", priceCents: 12000 },
    ],
  });

  // Um atendimento finalizado ainda sem cobrança, para aparecer em "Atendimentos ainda sem cobrança".
  if ((await prisma.encounter.count({ where: { clinicId: clinic.id, patientId: joao.id } })) === 0) {
    const fields = [{ key: "evolucao", label: "Evolução", type: "textarea" }];
    const encounter = await prisma.encounter.create({
      data: { clinicId: clinic.id, patientId: joao.id, professionalId: ana.id, fields, content: { evolucao: "Consulta de rotina, sem queixas." } },
    });
    const finalizedAt = new Date();
    await prisma.encounter.update({
      where: { id: encounter.id },
      data: { status: "FINALIZADO", finalizedAt, contentHash: encounterHash({ ...encounter, finalizedAt }) },
    });
  }

  const paid = [
    { patientId: maria.id, professionalId: ana.id, description: "Consulta clínica geral", amountCents: 25000, date: day(-3), paymentMethod: "PIX" as const },
    { patientId: maria.id, professionalId: carlos.id, description: "Sessão de psicologia", amountCents: 18000, date: day(-2), paymentMethod: "CARTAO_DEBITO" as const },
    { patientId: maria.id, professionalId: carlos.id, description: "Sessão de psicologia", amountCents: 18000, date: day(-1), paymentMethod: "DINHEIRO" as const },
  ];
  for (const c of paid) {
    const { lastReceiptNumber } = await prisma.clinic.update({ where: { id: clinic.id }, data: { lastReceiptNumber: { increment: 1 } } });
    await prisma.charge.create({
      data: {
        clinicId: clinic.id, patientId: c.patientId, professionalId: c.professionalId, description: c.description, amountCents: c.amountCents,
        dueDate: c.date, status: "PAGO", paymentMethod: c.paymentMethod, paidAt: c.date, receiptNumber: lastReceiptNumber,
      },
    });
  }
  await prisma.charge.createMany({
    data: [
      { clinicId: clinic.id, patientId: joao.id, professionalId: ana.id, description: "Eletrocardiograma", amountCents: 12000, dueDate: day(-10) },
      { clinicId: clinic.id, patientId: joao.id, professionalId: ana.id, description: "Retorno", amountCents: 15000, dueDate: day(5) },
    ],
  });

  await prisma.expense.createMany({
    data: [
      { clinicId: clinic.id, description: "Aluguel da sala", category: "Aluguel e condomínio", amountCents: 350000, dueDate: day(-5), status: "PAGO", paymentMethod: "BOLETO", paidAt: day(-5) },
      { clinicId: clinic.id, description: "Luvas e material descartável", category: "Materiais e insumos", amountCents: 42000, dueDate: day(-2), status: "PAGO", paymentMethod: "PIX", paidAt: day(-2) },
      { clinicId: clinic.id, description: "Internet", category: "Água, luz, internet e telefone", amountCents: 15000, dueDate: day(4) },
    ],
  });
  console.log("Exemplos do financeiro criados");
}

// CPFs de exemplo (válidos, mas fictícios) para testar o login por CPF. Também preenche bancos já criados.
async function seedLoginDemo() {
  const clinic = await prisma.clinic.findUnique({ where: { slug: "demo" } });
  if (!clinic) return;
  const cpfs: Record<string, string> = {
    "admin@demo.com": "12345678909",
    "ana@demo.com": "52998224725",
    "carlos@demo.com": "39053344705",
    "recepcao@demo.com": "11144477735",
  };
  for (const [email, cpf] of Object.entries(cpfs)) {
    await prisma.user.updateMany({ where: { clinicId: clinic.id, email, cpf: null }, data: { cpf } });
  }
}

// Função de cada usuário de demonstração, para o cadastro de servidores. Também preenche bancos já criados.
async function seedStaffDemo() {
  const clinic = await prisma.clinic.findUnique({ where: { slug: "demo" } });
  if (!clinic) return;
  const jobTitles: Record<string, string> = {
    "admin@demo.com": "Administrador",
    "ana@demo.com": "Médica",
    "carlos@demo.com": "Psicólogo",
    "recepcao@demo.com": "Recepcionista",
  };
  for (const [email, jobTitle] of Object.entries(jobTitles)) {
    await prisma.user.updateMany({ where: { clinicId: clinic.id, email, jobTitle: null }, data: { jobTitle } });
  }
}

// Exemplos da aba Contabilidade: auxiliar administrativo, contratos de trabalho com férias e experiência.
// Quem trabalha na clínica mas não usa o sistema (limpeza, estágio) entra no cadastro de servidores sem acesso ao sistema.
async function seedAccountingDemo() {
  const clinic = await prisma.clinic.findUnique({ where: { slug: "demo" } });
  if (!clinic || (await prisma.employmentContract.count({ where: { clinicId: clinic.id } })) > 0) return;

  const day = (offset: number) => {
    const iso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    return new Date(new Date(`${iso}T00:00:00Z`).getTime() + offset * 86400000);
  };
  const passwordHash = await bcrypt.hash("senha123", 10);
  const person = async (name: string, data: { email: string | null; role: "ADMINISTRATIVO" | "RECEPCAO"; jobTitle: string; sector: string }) =>
    (await prisma.user.findFirst({ where: { clinicId: clinic.id, name } })) ??
    prisma.user.create({
      data: {
        clinicId: clinic.id, name, passwordHash, email: data.email, role: data.role, jobTitle: data.jobTitle, sector: data.sector,
        systemAccess: !!data.email,
      },
    });

  const paula = await person("Paula Administrativo", { email: "administrativo@demo.com", role: "ADMINISTRATIVO", jobTitle: "Auxiliar administrativo", sector: "Administrativo" });
  const marcos = await person("Marcos Silva", { email: null, role: "RECEPCAO", jobTitle: "Auxiliar de limpeza", sector: "Serviços gerais" });
  const renata = await person("Renata Costa", { email: null, role: "RECEPCAO", jobTitle: "Estagiária de enfermagem", sector: "Enfermagem" });
  const julia = await prisma.user.findFirst({ where: { clinicId: clinic.id, email: "recepcao@demo.com" } });
  if (!julia) return;

  await prisma.clinic.update({
    where: { id: clinic.id },
    data: { taxRegime: "Simples Nacional", accountantName: "Escritório Contábil Exemplo", accountantEmail: "contador@exemplo.com.br" },
  });
  const contract = (userId: string, data: { type: "CLT" | "ESTAGIO"; admissionDate: Date; salaryCents: number; weeklyHours: number }) =>
    prisma.employmentContract.create({ data: { clinicId: clinic.id, userId, ...data } });
  const juliaC = await contract(julia.id, { type: "CLT", admissionDate: day(-700), salaryCents: 220000, weeklyHours: 44 });
  await contract(paula.id, { type: "CLT", admissionDate: day(-40), salaryCents: 250000, weeklyHours: 44 });
  const marcosC = await contract(marcos.id, { type: "CLT", admissionDate: day(-1100), salaryCents: 160000, weeklyHours: 44 });
  await contract(renata.id, { type: "ESTAGIO", admissionDate: day(-120), salaryCents: 90000, weeklyHours: 30 });
  await prisma.vacation.createMany({
    data: [
      { clinicId: clinic.id, contractId: marcosC.id, startDate: day(-700), endDate: day(-671) },
      { clinicId: clinic.id, contractId: marcosC.id, startDate: day(-300), endDate: day(-271) },
      { clinicId: clinic.id, contractId: juliaC.id, startDate: day(-200), endDate: day(-186), notes: "Primeira parte" },
    ],
  });

  // Obrigações acompanhadas há dois meses, já feitas até hoje, menos o INSS deste mês (para aparecer um atraso).
  if ((await prisma.taxObligation.count({ where: { clinicId: clinic.id } })) === 0) {
    await prisma.taxObligation.createMany({ data: defaultObligations.map((o) => ({ ...o, clinicId: clinic.id, createdAt: day(-60) })) });
  }
  const obligations = await prisma.taxObligation.findMany({ where: { clinicId: clinic.id } });
  const months = [dateInput(day(-30)).slice(0, 7), dateInput(day(0)).slice(0, 7)];
  for (const o of obligations) {
    for (const month of months) {
      const due = obligationDueDate(o, month);
      if (!due || due >= day(0) || due < day(-60) || (month === months[1] && o.name.startsWith("INSS"))) continue;
      await prisma.obligationEntry.create({ data: { clinicId: clinic.id, obligationId: o.id, month, doneAt: due } });
    }
  }
  console.log("Exemplos da contabilidade criados");
}

async function main() {
  await seedCid10();
  await seedDemo();
  await seedFinanceDemo();
  await seedLoginDemo();
  await seedStaffDemo();
  await seedAccountingDemo();
}

main().finally(() => prisma.$disconnect());
