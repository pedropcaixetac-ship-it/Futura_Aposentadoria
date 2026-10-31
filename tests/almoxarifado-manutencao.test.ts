// Versão hospitalar: almoxarifado e manutenção. A parte do banco precisa dele rodando (DATABASE_URL).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { deliverable, parseRequestLines, supplyBalance } from "../src/lib/almoxarifado";
import { preventiveDue, waitingLabel, workOrderOrder } from "../src/lib/manutencao";
import { tabInInstitution } from "../src/lib/tabs";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

const DAY = 86400_000;

test("saldo é a soma; entrega limitada ao pedido e ao saldo", () => {
  assert.equal(supplyBalance([{ quantity: 10 }, { quantity: -3 }, { quantity: -2 }]), 5);
  assert.equal(deliverable(10, 4), 4);
  assert.equal(deliverable(3, 40), 3);
  assert.equal(deliverable(3, -1), 0);
});

test("linhas do pedido: ignora vazias, recusa quantidade ruim e item repetido", () => {
  assert.deepEqual(parseRequestLines([{ itemId: "a", quantity: "2" }, { itemId: "", quantity: "" }, { itemId: "b", quantity: "5" }]), [
    { itemId: "a", quantity: 2 },
    { itemId: "b", quantity: 5 },
  ]);
  assert.equal(typeof parseRequestLines([{ itemId: "a", quantity: "0" }]), "string");
  assert.equal(typeof parseRequestLines([{ itemId: "a", quantity: "1,5" }]), "string");
  assert.equal(typeof parseRequestLines([{ itemId: "a", quantity: "1" }, { itemId: "a", quantity: "2" }]), "string");
  assert.equal(typeof parseRequestLines([{ itemId: "", quantity: "" }]), "string");
});

test("preventiva: vencida, vencendo em 7 dias, em dia, ou sem plano", () => {
  const now = new Date(Date.UTC(2026, 10, 1, 12));
  const created = new Date(now.getTime() - 400 * DAY);
  const e = (days: number | null, lastAgo: number | null) => ({ preventiveDays: days, lastPreventiveAt: lastAgo === null ? null : new Date(now.getTime() - lastAgo * DAY), createdAt: created });
  assert.equal(preventiveDue(e(90, 95), now).state, "VENCIDA");
  assert.equal(preventiveDue(e(30, 25), now).state, "VENCE_EM_BREVE");
  assert.equal(preventiveDue(e(180, 20), now).state, "OK");
  assert.equal(preventiveDue(e(null, null), now).state, "SEM_PLANO");
  // Nunca revisado: conta desde o cadastro.
  assert.equal(preventiveDue(e(365, null), now).state, "VENCIDA");
});

test("fila da manutenção: urgente, depois parado, depois o mais antigo", () => {
  const w = (name: string, urgent: boolean, stopped: boolean, h: number) => ({ name, urgent, stopped, createdAt: new Date(Date.UTC(2026, 10, 1, h)) });
  const list = [w("a", false, false, 1), w("b", false, true, 5), w("c", true, false, 6), w("d", true, true, 7), w("e", false, false, 0)].sort(workOrderOrder);
  assert.deepEqual(list.map((x) => x.name), ["d", "c", "b", "e", "a"]);
  const now = new Date(Date.UTC(2026, 10, 3, 12));
  assert.equal(waitingLabel(new Date(now.getTime() - 30 * 60_000), now), "há 30 min");
  assert.equal(waitingLabel(new Date(now.getTime() - 5 * 3600_000), now), "há 5 h");
  assert.equal(waitingLabel(new Date(now.getTime() - 2 * DAY), now), "há 2 dias");
});

test("as abas de apoio só aparecem no hospital", () => {
  for (const tab of ["chamados", "almoxarifado", "manutencao"] as const) {
    assert.equal(tabInInstitution("HOSPITAL", tab), true);
    assert.equal(tabInInstitution("CLINICA", tab), false);
  }
});

async function hospital(label: string) {
  const slug = `ap-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clinic = await prisma.clinic.create({ data: { name: `Hospital ${label}`, slug, kind: "HOSPITAL" } });
  const user = await prisma.user.create({ data: { clinicId: clinic.id, name: "Almoxarife", email: `${slug}@t.com`, passwordHash: "-", role: "ADMINISTRATIVO" } });
  const item = await prisma.supplyItem.create({ data: { clinicId: clinic.id, name: "Álcool", category: "Limpeza e higiene" } });
  return { clinic, user, item };
}

test("movimento do almoxarifado não muda nem some; item não se apaga", async () => {
  const h = await hospital("a");
  const m = await prisma.supplyMovement.create({ data: { clinicId: h.clinic.id, itemId: h.item.id, kind: "ENTRADA", quantity: 5, userId: h.user.id } });
  await assert.rejects(prisma.supplyMovement.update({ where: { id: m.id }, data: { quantity: 50 } }));
  await assert.rejects(prisma.supplyMovement.delete({ where: { id: m.id } }));
  await assert.rejects(prisma.supplyMovement.create({ data: { clinicId: h.clinic.id, itemId: h.item.id, kind: "AJUSTE", quantity: 0, userId: h.user.id } }), /SupplyMovement_quantidade/);
  await assert.rejects(prisma.supplyItem.delete({ where: { id: h.item.id } }));
});

test("pedido entregue não muda; linha só muda a quantidade entregue", async () => {
  const h = await hospital("b");
  const req = await prisma.supplyRequest.create({
    data: { clinicId: h.clinic.id, sector: "Enfermaria", requestedById: h.user.id, lines: { create: [{ clinicId: h.clinic.id, itemId: h.item.id, quantity: 3 }] } },
    include: { lines: true },
  });
  const line = req.lines[0];
  await assert.rejects(prisma.supplyRequestLine.update({ where: { id: line.id }, data: { quantity: 30 } }), /Só a quantidade entregue/);
  await assert.rejects(prisma.supplyRequest.update({ where: { id: req.id }, data: { sector: "UTI" } }), /trocar de setor/);
  await prisma.supplyRequestLine.update({ where: { id: line.id }, data: { delivered: 2 } });
  await prisma.supplyRequest.update({ where: { id: req.id }, data: { status: "ATENDIDA", handledAt: new Date(), handledById: h.user.id } });
  await assert.rejects(prisma.supplyRequest.update({ where: { id: req.id }, data: { status: "ABERTA" } }), /já atendido ou cancelado/);
  await assert.rejects(prisma.supplyRequestLine.update({ where: { id: line.id }, data: { delivered: 3 } }), /já atendido ou cancelado/);
  await assert.rejects(prisma.supplyRequest.delete({ where: { id: req.id } }), /não podem ser excluídos/);
});

test("chamado concluído não muda; número único por hospital; nada se apaga", async () => {
  const h = await hospital("c");
  const base = { clinicId: h.clinic.id, category: "Elétrica", location: "UTI", description: "Tomada", openedById: h.user.id };
  const wo = await prisma.workOrder.create({ data: { ...base, number: 1 } });
  await assert.rejects(prisma.workOrder.create({ data: { ...base, number: 1 } }));
  await assert.rejects(prisma.workOrder.update({ where: { id: wo.id }, data: { description: "Outra coisa" } }), /não pode trocar/);
  await prisma.workOrder.update({ where: { id: wo.id }, data: { status: "CONCLUIDO", closedAt: new Date(), closedById: h.user.id, solution: "Trocada" } });
  await assert.rejects(prisma.workOrder.update({ where: { id: wo.id }, data: { solution: "Mudei" } }), /já concluído ou cancelado/);
  await assert.rejects(prisma.workOrder.delete({ where: { id: wo.id } }), /não podem ser excluídos/);
});

test("pedido e chamado não apontam para item ou equipamento de outro hospital", async () => {
  const a = await hospital("d");
  const b = await hospital("e");
  const eq = await prisma.equipment.create({ data: { clinicId: b.clinic.id, name: "Monitor", tag: "PAT-1", location: "UTI" } });
  await assert.rejects(prisma.workOrder.create({ data: { clinicId: a.clinic.id, number: 1, category: "Equipamento médico", location: "UTI", description: "x", equipmentId: eq.id, openedById: a.user.id } }));
  await assert.rejects(
    prisma.supplyRequest.create({ data: { clinicId: a.clinic.id, sector: "UTI", requestedById: a.user.id, lines: { create: [{ clinicId: a.clinic.id, itemId: b.item.id, quantity: 1 }] } } }),
  );
});
