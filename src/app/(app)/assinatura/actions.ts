"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isValidCpf } from "@/lib/format";
import { authorizeUrl, availableProviders, isProviderId } from "@/lib/signature/providers";
import { signTarget, type SignTarget } from "@/lib/signature/service";
import { beginAuthorization, redirectUri } from "@/lib/signature/flow";

export async function startSigning(target: SignTarget, formData: FormData) {
  const user = await requireUser();
  const provider = formData.get("provider");
  if (!isProviderId(provider) || !availableProviders().some((p) => p.id === provider)) throw new Error("Provedor indisponível");

  const result = await signTarget(user, target, provider);
  if (result.signed) {
    revalidatePath(result.back);
    return;
  }
  // Ainda sem autorização: manda o profissional confirmar no app do certificado.
  if (provider === "TESTE") throw new Error("Falha no certificado de teste");
  const { state, codeChallenge } = await beginAuthorization(provider, target);
  redirect(authorizeUrl(provider, { redirectUri: await redirectUri(), state, codeChallenge, cpf: user.cpf }));
}

export async function saveCpf(formData: FormData) {
  const user = await requireUser();
  const cpf = String(formData.get("cpf") ?? "").replace(/\D/g, "");
  if (cpf && !isValidCpf(cpf)) redirect("/assinatura?erro=cpf");
  // O CPF também serve para entrar no sistema, então não pode repetir na clínica.
  const taken = cpf && (await prisma.user.findFirst({ where: { clinicId: user.clinicId, cpf, NOT: { id: user.id } } }));
  if (taken) redirect("/assinatura?erro=cpf-em-uso");
  await prisma.user.update({ where: { id: user.id }, data: { cpf: cpf || null } });
  revalidatePath("/assinatura");
}

export async function endSession(provider: string) {
  const user = await requireUser();
  await prisma.signatureSession.deleteMany({ where: { userId: user.id, provider } });
  revalidatePath("/assinatura");
}
