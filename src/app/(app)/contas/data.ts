import { withLock, type Tx } from "@/lib/lock";
import { autoLines, billTotal, roomHours } from "@/lib/conta-hospitalar";

// Monta (ou atualiza) a conta aberta de uma internação a partir do que os setores registraram:
// diárias, medicamentos dispensados pela farmácia, exames e cirurgias realizadas.
// Lançamentos feitos à mão ficam como estão. Conta fechada não muda.
export async function refreshBill(clinicId: string, admissionId: string, tx?: Tx) {
  const run = async (t: Tx) => {
    const admission = await t.admission.findFirst({ where: { id: admissionId, clinicId }, include: { bed: { include: { ward: true } } } });
    if (!admission) return null;
    const payer = admission.insurance?.trim() || "Particular";
    const bill =
      (await t.hospitalBill.findFirst({ where: { clinicId, admissionId } })) ??
      (await t.hospitalBill.create({ data: { clinicId, admissionId, payer } }));
    if (bill.status !== "ABERTA") return bill;

    const [moves, exams, surgeries, prices] = await Promise.all([
      t.stockMovement.groupBy({
        by: ["productId"],
        where: { clinicId, kind: { in: ["DISPENSACAO", "DEVOLUCAO"] }, prescriptionItem: { admissionId } },
        _sum: { quantity: true },
      }),
      t.examRequest.findMany({ where: { clinicId, admissionId, status: { not: "CANCELADO" } }, include: { examType: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
      t.surgery.findMany({ where: { clinicId, admissionId, status: "REALIZADA" }, orderBy: { scheduledAt: "asc" } }),
      t.hospitalPrice.findMany({ where: { clinicId } }),
    ]);
    const products = await t.pharmacyProduct.findMany({ where: { clinicId, id: { in: moves.map((m) => m.productId) } } });
    const productById = new Map(products.map((p) => [p.id, p]));
    const lines = autoLines(
      {
        admittedAt: admission.admittedAt,
        dischargedAt: admission.dischargedAt,
        wardKind: admission.bed.ward.kind,
        medications: moves.map((m) => {
          const p = productById.get(m.productId);
          return { productId: m.productId, name: [p?.name, p?.presentation].filter(Boolean).join(" "), unit: p?.unit ?? "unidade", quantity: -(m._sum.quantity ?? 0) };
        }),
        exams: exams.map((e) => ({ id: e.id, name: e.examType.name, at: e.createdAt })),
        surgeries: surgeries.map((s) => ({ id: s.id, procedure: s.procedure, hours: roomHours(s) })),
      },
      new Map(prices.map((p) => [p.key, p.priceCents])),
      new Map(exams.map((e) => [e.id, e.examType.id])),
    );

    // Some o que deixou de existir (ex.: exame cancelado) e atualiza o resto.
    await t.hospitalBillItem.deleteMany({ where: { clinicId, billId: bill.id, source: { not: null, notIn: lines.map((l) => l.source) } } });
    for (const l of lines) {
      const data = { kind: l.kind, description: l.description.slice(0, 200), quantity: l.quantity, unitCents: l.unitCents, totalCents: l.quantity * l.unitCents };
      await t.hospitalBillItem.upsert({
        where: { billId_source: { billId: bill.id, source: l.source } },
        create: { clinicId, billId: bill.id, source: l.source, ...data },
        update: data,
      });
    }
    const items = await t.hospitalBillItem.findMany({ where: { clinicId, billId: bill.id }, select: { quantity: true, unitCents: true } });
    return t.hospitalBill.update({ where: { id: bill.id }, data: { payer, totalCents: billTotal(items) } });
  };
  return tx ? run(tx) : withLock([`conta:${admissionId}`], run);
}
