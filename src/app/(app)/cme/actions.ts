"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type SterilizationMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { withLock } from "@/lib/lock";
import { loadCode, methodLabel, packageExpiry } from "@/lib/cme";

export type FormState = { error: string; ok?: string };

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function saveKit(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("cme");
  const name = text(formData, "name");
  if (!name) return { error: "Informe o nome do kit." };
  const validityDays = Number(text(formData, "validityDays") ?? 30);
  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 365) return { error: "A validade vai de 1 a 365 dias." };
  try {
    await prisma.cmeKit.create({ data: { clinicId: user.clinicId, name, validityDays } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Já existe um kit com esse nome." };
    throw e;
  }
  revalidatePath("/cme");
  return { error: "", ok: `${name} cadastrado.` };
}

// Nova carga: um pacote para cada kit colocado no equipamento. Fica aguardando os indicadores.
export async function startLoad(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("cme");
  const method = text(formData, "method") as SterilizationMethod | null;
  if (!method || !(method in methodLabel)) return { error: "Escolha o método." };
  const equipment = text(formData, "equipment");
  if (!equipment) return { error: "Informe o equipamento (ex.: Autoclave 1)." };
  const kits = await prisma.cmeKit.findMany({ where: { clinicId: user.clinicId, active: true } });
  const items = kits.map((k) => ({ kit: k, qty: Number(text(formData, `qty_${k.id}`) ?? 0) })).filter((i) => i.qty !== 0);
  if (items.some((i) => !Number.isInteger(i.qty) || i.qty < 0 || i.qty > 200)) return { error: "Quantidade inválida." };
  if (items.length === 0) return { error: "Informe quantos pacotes de cada kit entraram na carga." };
  const now = new Date();
  const { id: loadId, code } = await withLock([`cme:carga:${user.clinicId}`], async (tx) => {
    const dayStart = new Date(now.getTime() - 3 * 3600_000);
    dayStart.setUTCHours(3, 0, 0, 0);
    const today = await tx.sterilizationLoad.count({ where: { clinicId: user.clinicId, equipment, startedAt: { gte: dayStart } } });
    const code = loadCode(equipment, now, today + 1);
    const load = await tx.sterilizationLoad.create({ data: { clinicId: user.clinicId, code, method, equipment, startedAt: now, operatorId: user.id } });
    await tx.sterilePackage.createMany({
      data: items.flatMap((i) => Array.from({ length: i.qty }, () => ({ clinicId: user.clinicId, loadId: load.id, kitId: i.kit.id, expiresAt: packageExpiry(now, i.kit.validityDays) }))),
    });
    return { id: load.id, code };
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CME_CARGA", entity: "SterilizationLoad", entityId: loadId, details: { carga: code, pacotes: items.reduce((s, i) => s + i.qty, 0) } });
  revalidatePath("/cme");
  return { error: "", ok: `Carga ${code} registrada. Libere depois de ler os indicadores.` };
}

// Resultado da carga: liberar exige indicador químico e biológico aprovados; reprovar exige o motivo.
export async function judgeLoad(loadId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("cme");
  const decision = text(formData, "decision");
  const chemicalOk = formData.get("chemicalOk") === "on";
  const biologicalOk = formData.get("biologicalOk") === "on";
  const note = text(formData, "note");
  if (decision !== "LIBERADA" && decision !== "REPROVADA") return { error: "Escolha liberar ou reprovar." };
  if (decision === "LIBERADA" && !(chemicalOk && biologicalOk)) return { error: "Só libera com o indicador químico e o biológico aprovados." };
  if (decision === "REPROVADA" && !note) return { error: "Informe o motivo da reprovação." };
  const load = await prisma.sterilizationLoad.findFirst({ where: { id: loadId, clinicId: user.clinicId } });
  if (!load) return { error: "Carga não encontrada." };
  const { count } = await prisma.sterilizationLoad.updateMany({
    where: { id: load.id, clinicId: user.clinicId, result: "PENDENTE" },
    data: { result: decision, chemicalOk, biologicalOk, resultAt: new Date(), resultById: user.id, resultNote: note },
  });
  if (!count) return { error: "O resultado desta carga já foi registrado." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CME_RESULTADO", entity: "SterilizationLoad", entityId: load.id, details: { carga: load.code, resultado: decision } });
  revalidatePath("/cme");
  revalidatePath(`/cme/carga/${load.id}`);
  return { error: "", ok: decision === "LIBERADA" ? "Carga liberada: os pacotes podem ser usados." : "Carga reprovada: reprocessar o material." };
}

// Recolher carga já liberada (ex.: indicador biológico positivo depois): bloqueia os pacotes que sobraram.
export async function recallLoad(loadId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("cme");
  const note = text(formData, "note");
  if (!note) return { error: "Informe o motivo do recolhimento." };
  const load = await prisma.sterilizationLoad.findFirst({ where: { id: loadId, clinicId: user.clinicId } });
  if (!load) return { error: "Carga não encontrada." };
  const { count } = await prisma.sterilizationLoad.updateMany({
    where: { id: load.id, clinicId: user.clinicId, result: "LIBERADA" },
    data: { result: "RECOLHIDA", resultAt: new Date(), resultById: user.id, resultNote: note },
  });
  if (!count) return { error: "Só carga liberada pode ser recolhida." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CME_RESULTADO", entity: "SterilizationLoad", entityId: load.id, details: { carga: load.code, resultado: "RECOLHIDA", motivo: note } });
  revalidatePath(`/cme/carga/${load.id}`);
  revalidatePath("/cme");
  return { error: "", ok: "Carga recolhida. Veja abaixo as cirurgias que usaram pacotes dela e avise a CCIH." };
}

// Descartar pacote (vencido, embalagem violada, molhada): volta para reprocessar numa nova carga.
export async function discardPackage(packageId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("cme");
  const reason = text(formData, "reason") ?? "Vencido";
  const { count } = await prisma.sterilePackage.updateMany({
    where: { id: packageId, clinicId: user.clinicId, usedAt: null, discardedAt: null },
    data: { discardedAt: new Date(), discardedById: user.id, discardReason: reason },
  });
  if (!count) return { error: "Pacote já usado ou descartado." };
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CME_PACOTE", entity: "SterilePackage", entityId: packageId, details: { acao: "descartou", motivo: reason } });
  revalidatePath("/cme");
  return { error: "", ok: "Pacote retirado para reprocessar." };
}
