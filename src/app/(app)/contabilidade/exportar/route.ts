import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canAccessAccounting } from "@/lib/permissions";
import { formatCpf } from "@/lib/format";
import { monthRange, paymentMethodLabel, statusLabel } from "@/lib/finance";
import { activeInMonth, csvDate, csvMoney, employmentTypeLabel, toCsv } from "@/lib/accounting";

// Planilha do mês para o contador: receitas, despesas, folha e obrigações cumpridas.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canAccessAccounting(user)) return new Response("Sem permissão", { status: 403 });
  const range = monthRange(new URL(request.url).searchParams.get("mes") ?? undefined);
  const clinicId = user.clinicId;
  const inMonth = { gte: range.start, lt: range.end };

  const [charges, expenses, employees, entries] = await Promise.all([
    prisma.charge.findMany({
      where: { clinicId, status: "PAGO", paidAt: inMonth },
      include: { patient: true, professional: true },
      orderBy: { paidAt: "asc" },
    }),
    prisma.expense.findMany({ where: { clinicId, status: { not: "CANCELADO" }, dueDate: inMonth }, orderBy: { dueDate: "asc" } }),
    prisma.employee.findMany({
      where: { clinicId },
      include: { payrollEntries: { where: { month: range.month } } },
      orderBy: { name: "asc" },
    }),
    prisma.obligationEntry.findMany({ where: { clinicId, month: range.month }, include: { obligation: true }, orderBy: { doneAt: "asc" } }),
  ]);

  const rows: (string | number | null)[][] = [
    [`${user.clinic.name} - ${range.label}`],
    [],
    ["RECEITAS RECEBIDAS"],
    ["Data", "Recibo", "Paciente", "CPF do paciente", "Profissional", "Descrição", "Forma de pagamento", "Valor"],
    ...charges.map((c) => [
      csvDate(c.paidAt),
      c.receiptNumber,
      c.patient.name,
      formatCpf(c.patient.cpf),
      c.professional?.name ?? "",
      c.description,
      c.paymentMethod ? paymentMethodLabel[c.paymentMethod] : "",
      csvMoney(c.amountCents),
    ]),
    ["", "", "", "", "", "", "Total", csvMoney(charges.reduce((t, c) => t + c.amountCents, 0))],
    [],
    ["DESPESAS DO MÊS"],
    ["Vencimento", "Descrição", "Categoria", "Situação", "Pago em", "Forma de pagamento", "Valor"],
    ...expenses.map((e) => [
      csvDate(e.dueDate),
      e.description,
      e.category,
      statusLabel[e.status],
      csvDate(e.paidAt),
      e.paymentMethod ? paymentMethodLabel[e.paymentMethod] : "",
      csvMoney(e.amountCents),
    ]),
    ["", "", "", "", "", "Total", csvMoney(expenses.reduce((t, e) => t + e.amountCents, 0))],
    [],
    ["FOLHA DO MÊS"],
    ["Funcionário", "CPF", "Função", "Vínculo", "Admissão", "Desligamento", "Salário", "Faltas (dias)", "Horas extras", "Outros ganhos", "Descontos", "Líquido (contador)", "Observação"],
    ...employees
      .filter((e) => activeInMonth(e, range))
      .map((e) => {
        const p = e.payrollEntries[0];
        return [
          e.name,
          formatCpf(e.cpf),
          e.jobTitle,
          employmentTypeLabel[e.type],
          csvDate(e.admissionDate),
          csvDate(e.terminatedAt),
          csvMoney(p?.baseCents ?? e.salaryCents),
          p?.absenceDays ?? 0,
          p?.overtimeHours ?? 0,
          csvMoney(p?.additionsCents ?? 0),
          csvMoney(p?.deductionsCents ?? 0),
          csvMoney(p?.netCents),
          p?.notes ?? "",
        ];
      }),
    [],
    ["OBRIGAÇÕES FEITAS"],
    ["Obrigação", "Tipo", "Feito em", "Valor", "Observação"],
    ...entries.map((x) => [x.obligation.name, x.obligation.kind, csvDate(x.doneAt), csvMoney(x.amountCents), x.notes ?? ""]),
  ];

  await audit({ clinicId, userId: user.id, action: "CONTABILIDADE_EXPORTADA", entity: "Clinic", entityId: clinicId, details: { month: range.month } });
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contabilidade-${range.month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
