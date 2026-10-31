"use server";

import { revalidatePath } from "next/cache";
import type { InvoiceIssuer } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canIssueInvoice, canManageFinance, canRequestInvoice } from "@/lib/permissions";
import { parseDateInput, today } from "@/lib/finance";
import { invoiceMissing, parseIssRate } from "@/lib/nfse";
import { buildDps, checkDps, focusConfigured, sendDps, type FocusResult } from "@/lib/nfse-focus";
import { onlyDigits } from "@/lib/format";
import { displayName } from "@/lib/staff";
import type { FormState } from "../actions";

// Estas ações servem ao Financeiro e ao "Meu financeiro" do profissional,
// por isso conferem a permissão em cada nota em vez de exigir a aba.

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function revalidate() {
  revalidatePath("/financeiro", "layout");
  revalidatePath("/meu-financeiro", "layout");
}

async function paidCharge(clinicId: string, chargeId: string) {
  const charge = await prisma.charge.findFirst({
    where: { id: chargeId, clinicId },
    include: { serviceInvoice: true, clinic: { select: { invoiceIssuer: true } } },
  });
  if (!charge) throw new Error("Cobrança não encontrada");
  return charge;
}

// O paciente pediu a nota: fica na lista de notas a emitir de quem é o emissor.
export async function requestInvoice(chargeId: string) {
  const user = await requireUser();
  const charge = await paidCharge(user.clinicId, chargeId);
  if (!canRequestInvoice(user, charge)) throw new Error("Sem permissão");
  if (charge.status !== "PAGO") throw new Error("A nota só é pedida depois do pagamento");
  if (charge.serviceInvoice && charge.serviceInvoice.status !== "CANCELADA") return;

  const data = { issuer: charge.clinic.invoiceIssuer, status: "PEDIDA" as const, requestedAt: new Date(), requestedById: user.id };
  const invoice = charge.serviceInvoice
    ? await prisma.serviceInvoice.update({
        where: { id: charge.serviceInvoice.id },
        data: { ...data, number: null, verificationCode: null, issuedAt: null, issuedById: null },
      })
    : await prisma.serviceInvoice.create({ data: { ...data, clinicId: user.clinicId, chargeId: charge.id } }).catch((e) => {
        // Clique duplo em "Pedir nota": a primeira já pediu, a segunda não faz nada.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
        throw e;
      });
  if (!invoice) return;
  await audit({ clinicId: user.clinicId, userId: user.id, action: "NOTA_PEDIDA", entity: "ServiceInvoice", entityId: invoice.id, patientId: charge.patientId });
  revalidate();
}

// Anota a nota emitida no emissor nacional: número, código de verificação e data.
export async function markInvoiceIssued(invoiceId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const invoice = await prisma.serviceInvoice.findFirst({ where: { id: invoiceId, clinicId: user.clinicId }, include: { charge: true } });
  if (!invoice || invoice.status !== "PEDIDA") return { error: "Esta nota não está mais esperando emissão." };
  if (!canIssueInvoice(user, invoice, invoice.charge)) return { error: "Você não pode anotar esta nota." };

  const number = text(formData, "number");
  if (!number) return { error: "Informe o número da nota." };
  const issuedAt = parseDateInput(text(formData, "issuedAt") ?? "") ?? today();
  await prisma.serviceInvoice.update({
    where: { id: invoice.id },
    data: {
      status: "EMITIDA",
      number: number.slice(0, 30),
      verificationCode: text(formData, "verificationCode")?.slice(0, 80) ?? null,
      issuedAt,
      issuedById: user.id,
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "NOTA_EMITIDA", entity: "ServiceInvoice", entityId: invoice.id, patientId: invoice.charge.patientId, details: { number } });
  revalidate();
  return { error: "", ok: "Nota anotada." };
}

// Guarda o que a Focus respondeu: nota autorizada vira EMITIDA; erro fica anotado para corrigir e tentar de novo.
async function saveFocusResult(invoiceId: string, userId: string, result: FocusResult) {
  if (result.state === "autorizada") {
    await prisma.serviceInvoice.update({
      where: { id: invoiceId },
      data: {
        status: "EMITIDA",
        providerStatus: null,
        providerMessage: null,
        number: result.number.slice(0, 30),
        verificationCode: result.verificationCode?.slice(0, 80) ?? null,
        url: result.url,
        pdfUrl: result.pdfUrl,
        issuedAt: new Date(),
        issuedById: userId,
      },
    });
  } else {
    await prisma.serviceInvoice.update({
      where: { id: invoiceId },
      data: { providerStatus: result.state, providerMessage: result.state === "erro" ? result.message : null },
    });
  }
}

async function issuableInvoice(invoiceId: string) {
  const user = await requireUser();
  const invoice = await prisma.serviceInvoice.findFirst({
    where: { id: invoiceId, clinicId: user.clinicId },
    include: {
      clinic: true,
      charge: {
        include: {
          patient: { select: { name: true, cpf: true, email: true } },
          professional: { select: { id: true, name: true, cpf: true, municipalRegistration: true, jobTitle: true, sex: true } },
        },
      },
    },
  });
  if (!invoice || invoice.status !== "PEDIDA") throw new Error("Esta nota não está mais esperando emissão");
  if (!canIssueInvoice(user, invoice, invoice.charge)) throw new Error("Sem permissão");
  return { user, invoice };
}

// Botão "Emitir nota": envia o pedido à Focus NFe, que repassa ao emissor nacional.
export async function emitInvoice(invoiceId: string): Promise<FormState> {
  if (!focusConfigured()) return { error: "A emissão automática ainda não foi ligada (falta a chave da Focus NFe)." };
  const { user, invoice } = await issuableInvoice(invoiceId);
  if (invoice.providerStatus === "processando") return { error: "Esta nota já foi enviada e está sendo analisada." };
  const { clinic, charge } = invoice;
  const professional = charge.professional ? { ...charge.professional, name: displayName(charge.professional) } : null;
  const missing = invoiceMissing(invoice.issuer, clinic, professional, charge);
  if (onlyDigits(clinic.serviceCode).length !== 6 && clinic.serviceCode) missing.push("código do serviço com 6 números (ex.: 04.01.01)");
  if (missing.length > 0) return { error: `Falta no cadastro: ${missing.join(", ")}.` };

  // Cada emissor tem a própria sequência de números de DPS; o número só é usado uma vez, mesmo se der erro.
  const dpsNumber =
    invoice.issuer === "CLINICA"
      ? (await prisma.clinic.update({ where: { id: clinic.id }, data: { lastDpsNumber: { increment: 1 } } })).lastDpsNumber
      : (await prisma.user.update({ where: { id: charge.professional!.id }, data: { lastDpsNumber: { increment: 1 } } })).lastDpsNumber;
  const attempts = invoice.attempts + 1;
  const ref = `${invoice.id}-${attempts}`;
  await prisma.serviceInvoice.update({
    where: { id: invoice.id },
    data: { provider: "focus", providerRef: ref, attempts, providerStatus: "processando", providerMessage: null },
  });

  let result: FocusResult;
  try {
    result = await sendDps(ref, buildDps({ issuer: invoice.issuer, clinic, professional, charge, dpsNumber, now: new Date() }));
    // A prefeitura costuma responder em poucos segundos: confere uma vez antes de voltar para a tela.
    if (result.state === "processando") {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      result = await checkDps(ref);
    }
  } catch {
    result = { state: "erro", message: "Não foi possível falar com a Focus NFe agora. Tente de novo em alguns minutos." };
  }
  await saveFocusResult(invoice.id, user.id, result);
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: result.state === "autorizada" ? "NOTA_EMITIDA" : "NOTA_ENVIADA",
    entity: "ServiceInvoice",
    entityId: invoice.id,
    patientId: charge.patientId,
    details: { ref, resultado: result.state },
  });
  revalidate();
  // O motivo do erro fica guardado na nota e aparece logo acima do botão.
  if (result.state === "erro") return { error: "" };
  if (result.state === "processando") return { error: "", ok: "Nota enviada. A prefeitura ainda está analisando; clique em \"Atualizar\" daqui a pouco." };
  return { error: "", ok: `Nota ${result.number} emitida.` };
}

// Pergunta à Focus como está a nota enviada.
export async function refreshInvoice(invoiceId: string) {
  const { user, invoice } = await issuableInvoice(invoiceId);
  if (invoice.provider !== "focus" || !invoice.providerRef || invoice.providerStatus !== "processando") return;
  let result: FocusResult;
  try {
    result = await checkDps(invoice.providerRef);
  } catch {
    return;
  }
  await saveFocusResult(invoice.id, user.id, result);
  if (result.state === "autorizada") {
    await audit({ clinicId: user.clinicId, userId: user.id, action: "NOTA_EMITIDA", entity: "ServiceInvoice", entityId: invoice.id, patientId: invoice.charge.patientId, details: { number: result.number } });
  }
  revalidate();
}

// O paciente desistiu, ou a nota foi cancelada no emissor.
export async function cancelInvoice(invoiceId: string) {
  const user = await requireUser();
  const invoice = await prisma.serviceInvoice.findFirst({ where: { id: invoiceId, clinicId: user.clinicId }, include: { charge: true } });
  if (!invoice || invoice.status === "CANCELADA") return;
  if (!canIssueInvoice(user, invoice, invoice.charge)) throw new Error("Sem permissão");
  await prisma.serviceInvoice.update({ where: { id: invoice.id }, data: { status: "CANCELADA" } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "NOTA_CANCELADA", entity: "ServiceInvoice", entityId: invoice.id, patientId: invoice.charge.patientId });
  revalidate();
}

// O profissional marca (ou desmarca) que já lançou o recibo deste pagamento no Receita Saúde.
export async function toggleHealthReceipt(chargeId: string) {
  const user = await requireUser();
  const charge = await paidCharge(user.clinicId, chargeId);
  if (charge.professionalId !== user.id || charge.status !== "PAGO") throw new Error("Sem permissão");
  const healthReceiptAt = charge.healthReceiptAt ? null : today();
  await prisma.charge.update({ where: { id: charge.id }, data: { healthReceiptAt } });
  if (healthReceiptAt) {
    await audit({ clinicId: user.clinicId, userId: user.id, action: "RECEITA_SAUDE_LANCADO", entity: "Charge", entityId: charge.id, patientId: charge.patientId });
  }
  revalidate();
}

// Configuração da clínica: quem emite e os dados fiscais.
export async function updateInvoiceSettings(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("financeiro");
  if (!canManageFinance(user)) return { error: "Sem permissão." };
  const issuer = text(formData, "invoiceIssuer");
  if (issuer !== "CLINICA" && issuer !== "PROFISSIONAL") return { error: "Escolha quem emite a nota." };
  const cityIbgeCode = text(formData, "cityIbgeCode")?.replace(/\D/g, "") || null;
  if (cityIbgeCode && cityIbgeCode.length !== 7) return { error: "O código IBGE da cidade tem 7 números (Goiânia: 5208707)." };
  const rate = parseIssRate(text(formData, "issRate") ?? "");
  if (rate === "invalid") return { error: "A alíquota do ISS fica entre 2% e 5% (ex.: 2 ou 2,5)." };

  await prisma.clinic.update({
    where: { id: user.clinicId },
    data: {
      invoiceIssuer: issuer as InvoiceIssuer,
      municipalRegistration: text(formData, "municipalRegistration"),
      cityIbgeCode,
      serviceCode: text(formData, "serviceCode"),
      issRateBasisPoints: rate,
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "NOTA_CONFIGURADA", entity: "Clinic", entityId: user.clinicId, details: { issuer } });
  revalidate();
  return { error: "", ok: "Dados da nota salvos." };
}

// O profissional informa a própria inscrição municipal (autônomo), usada na nota emitida por ele.
export async function updateMyMunicipalRegistration(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("meu-financeiro");
  await prisma.user.update({ where: { id: user.id }, data: { municipalRegistration: text(formData, "municipalRegistration") } });
  revalidate();
  return { error: "", ok: "Inscrição salva." };
}
