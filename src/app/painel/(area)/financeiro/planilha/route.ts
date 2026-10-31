import { prisma } from "@/lib/db";
import { getPlatformUser } from "@/lib/painel-auth";
import { monthRange, paymentsCsv } from "@/lib/painel-financeiro";

// Planilha dos pagamentos do mês, para o contador.
export async function GET(request: Request) {
  const user = await getPlatformUser();
  if (!user || user.mustChangePassword) return new Response("Entre no painel primeiro.", { status: 401 });
  const month = new URL(request.url).searchParams.get("mes") ?? "";
  const range = monthRange(month);
  if (!range) return new Response("Mês inválido.", { status: 400 });

  const payments = await prisma.clinicPayment.findMany({
    where: { paidAt: { gte: range.start, lt: range.end } },
    include: { clinic: { select: { name: true } }, createdBy: { select: { name: true } } },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
  });
  const csv = paymentsCsv(payments.map((p) => ({
    paidAt: p.paidAt,
    clinicName: p.clinic.name,
    amountCents: p.amountCents,
    method: p.method,
    paidUntil: p.paidUntil,
    registeredBy: p.createdBy.name,
    notes: p.notes,
    canceled: !!p.canceledAt,
  })));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mensalidades-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
