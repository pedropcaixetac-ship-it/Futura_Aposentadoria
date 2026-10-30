// Dados iniciais para testar o sistema: tabela CID-10, uma clínica de
// demonstração, usuários de cada perfil, modelos de atendimento e pacientes.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { encounterHash } from "../src/lib/record";

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

// Exemplo da aba Compras: uma nota de medicamentos em 2 parcelas (a primeira já paga).
async function seedPurchasesDemo() {
  const clinic = await prisma.clinic.findUnique({ where: { slug: "demo" } });
  if (!clinic || (await prisma.purchase.count({ where: { clinicId: clinic.id } })) > 0) return;
  const admin = await prisma.user.findFirst({ where: { clinicId: clinic.id, role: "ADMIN" } });
  if (!admin) return;
  const day = (offset: number) => {
    const iso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    return new Date(new Date(`${iso}T00:00:00Z`).getTime() + offset * 86400000);
  };
  const supplier = "Distribuidora Saúde Exemplo Ltda";
  await prisma.purchase.create({
    data: {
      clinicId: clinic.id,
      createdById: admin.id,
      kind: "Medicamentos",
      supplierName: supplier,
      supplierCnpj: "11222333000181",
      invoiceNumber: "4521",
      invoiceSeries: "1",
      issueDate: day(-3),
      totalCents: 86000,
      items: {
        create: [
          { position: 1, description: "Dipirona sódica 500 mg/ml ampola 2 ml", unit: "CX", quantity: 4, unitPriceCents: 9500, totalCents: 38000, batch: "DP2291", expiresAt: day(60) },
          { position: 2, description: "Lidocaína 2% sem vasoconstritor 20 ml", unit: "FR", quantity: 10, unitPriceCents: 2800, totalCents: 28000, batch: "LD0912", expiresAt: day(400) },
          { position: 3, description: "Seringa descartável 5 ml (caixa com 100)", unit: "CX", quantity: 2, unitPriceCents: 10000, totalCents: 20000, batch: "SR7781", expiresAt: day(900) },
        ],
      },
      expenses: {
        create: [
          { clinicId: clinic.id, description: `NF 4521 · ${supplier} (1/2)`, category: "Medicamentos", amountCents: 43000, dueDate: day(-3), installment: 1, status: "PAGO", paymentMethod: "BOLETO", paidAt: day(-3) },
          { clinicId: clinic.id, description: `NF 4521 · ${supplier} (2/2)`, category: "Medicamentos", amountCents: 43000, dueDate: day(27), installment: 2 },
        ],
      },
    },
  });
  console.log("Exemplo de compras criado");
}

async function main() {
  await seedCid10();
  await seedDemo();
  await seedFinanceDemo();
  await seedPurchasesDemo();
}

main().finally(() => prisma.$disconnect());
