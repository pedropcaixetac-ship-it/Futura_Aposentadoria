"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { authorizeUrl, availableProviders, isProviderId } from "@/lib/signature/providers";
import { isSafeBack, signTarget, type SignTarget } from "@/lib/signature/service";
import { beginAuthorization, redirectUri } from "@/lib/signature/flow";

export async function startSigning(target: SignTarget, formData: FormData) {
  await signMany([target], formData);
}

// "Assinar todos": uma única autorização no app do certificado assina todos os itens.
export async function startSigningAll(targets: SignTarget[], formData: FormData) {
  await signMany(targets, formData);
}

async function signMany(targets: SignTarget[], formData: FormData) {
  const user = await requireUser("assinatura");
  const provider = formData.get("provider");
  if (!isProviderId(provider) || !availableProviders().some((p) => p.id === provider)) throw new Error("Provedor indisponível");
  const requestedBack = formData.get("back");

  let back = "";
  let missing = false;
  for (const target of targets) {
    const result = await signTarget(user, target, provider);
    back ||= result.back;
    if (!result.signed) missing = true;
  }
  if (isSafeBack(requestedBack)) back = requestedBack;
  if (!missing) {
    if (back) revalidatePath(back);
    return;
  }
  // Ainda sem autorização: manda o profissional confirmar no app do certificado.
  if (provider === "TESTE") throw new Error("Falha no certificado de teste");
  const { state, codeChallenge } = await beginAuthorization(provider, targets, back);
  redirect(authorizeUrl(provider, { redirectUri: await redirectUri(), state, codeChallenge, cpf: user.cpf }));
}
