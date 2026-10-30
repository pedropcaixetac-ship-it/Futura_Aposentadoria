import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { isProviderId, type ProviderId } from "./providers";
import { isSafeBack, isSignTarget, type SignTarget } from "./service";

// Dados guardados enquanto o profissional autoriza no app do certificado.
const COOKIE = "assinatura_pendente";

// Pode ser um item só ou vários ("Assinar todos"); back é a tela para onde o profissional volta.
type Pending = { state: string; verifier: string; provider: Exclude<ProviderId, "TESTE">; targets: SignTarget[]; back: string };

export async function redirectUri() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/assinatura/retorno`;
}

export async function beginAuthorization(provider: Pending["provider"], targets: SignTarget[], back: string) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const pending: Pending = { state, verifier, provider, targets, back };
  (await cookies()).set(COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/assinatura",
  });
  return { state, codeChallenge: createHash("sha256").update(verifier).digest("base64url") };
}

export async function takePending(state: string | null) {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  jar.delete({ name: COOKIE, path: "/api/assinatura" });
  if (!raw || !state) return null;
  try {
    const pending = JSON.parse(raw) as Pending;
    if (
      pending.state !== state ||
      !isProviderId(pending.provider) ||
      !Array.isArray(pending.targets) ||
      !pending.targets.every(isSignTarget) ||
      !isSafeBack(pending.back)
    ) {
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}
