import { SHA256_OID } from "./cms";

// Provedores de certificado em nuvem. Todos seguem o mesmo padrão do ITI
// (DOC-ICP-17.01): muda só o endereço e as credenciais que cada provedor
// entrega quando a clínica se cadastra como "sistema parceiro".

export type ProviderId = "VIDAAS" | "BIRDID" | "TESTE";

type PscConfig = { label: string; baseUrl: string; clientId?: string; clientSecret?: string };

function pscConfig(id: Exclude<ProviderId, "TESTE">): PscConfig {
  if (id === "VIDAAS") {
    return {
      label: "VIDaaS (Valid, certificado gratuito do CFM)",
      baseUrl: process.env.VIDAAS_URL ?? "https://certificado.vidaas.com.br/v0",
      clientId: process.env.VIDAAS_CLIENT_ID,
      clientSecret: process.env.VIDAAS_CLIENT_SECRET,
    };
  }
  return {
    label: "BirdID (Soluti)",
    baseUrl: process.env.BIRDID_URL ?? "https://api.birdid.com.br/v0",
    clientId: process.env.BIRDID_CLIENT_ID,
    clientSecret: process.env.BIRDID_CLIENT_SECRET,
  };
}

export const providerLabel: Record<ProviderId, string> = {
  VIDAAS: "VIDaaS",
  BIRDID: "BirdID",
  TESTE: "Certificado de teste",
};

// O certificado de teste aparece fora da produção, nas versões de teste da
// Vercel (preview) ou quando ASSINATURA_TESTE=1.
export function testProviderEnabled() {
  return (
    process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview" || process.env.ASSINATURA_TESTE === "1"
  );
}

// Só aparecem para o profissional os provedores já configurados.
export function availableProviders(): { id: ProviderId; label: string }[] {
  const list: { id: ProviderId; label: string }[] = [];
  for (const id of ["VIDAAS", "BIRDID"] as const) {
    const config = pscConfig(id);
    if (config.clientId && config.clientSecret) list.push({ id, label: config.label });
  }
  if (testProviderEnabled()) list.push({ id: "TESTE", label: "Certificado de teste (sem validade jurídica)" });
  return list;
}

export function isProviderId(value: unknown): value is ProviderId {
  return value === "VIDAAS" || value === "BIRDID" || value === "TESTE";
}

// Quanto tempo a autorização vale: um turno de trabalho.
export const SESSION_SECONDS = 8 * 3600;

function config(id: Exclude<ProviderId, "TESTE">) {
  const c = pscConfig(id);
  if (!c.clientId || !c.clientSecret) throw new Error(`${providerLabel[id]} não está configurado`);
  return c as Required<PscConfig>;
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const text = await response.text();
  if (!response.ok) throw new Error(`Provedor respondeu ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export function authorizeUrl(
  id: Exclude<ProviderId, "TESTE">,
  p: { redirectUri: string; state: string; codeChallenge: string; cpf: string | null },
) {
  const c = config(id);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: c.clientId,
    redirect_uri: p.redirectUri,
    scope: "signature_session",
    lifetime: String(SESSION_SECONDS),
    state: p.state,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
  });
  if (p.cpf) params.set("login_hint", p.cpf);
  return `${c.baseUrl}/oauth/authorize?${params}`;
}

export async function exchangeCode(id: Exclude<ProviderId, "TESTE">, p: { code: string; redirectUri: string; codeVerifier: string }) {
  const c = config(id);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: c.clientId,
    client_secret: c.clientSecret,
    code: p.code,
    redirect_uri: p.redirectUri,
    code_verifier: p.codeVerifier,
  });
  const token = await call<{ access_token: string; expires_in?: number }>(`${c.baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  return { accessToken: token.access_token, expiresIn: token.expires_in || SESSION_SECONDS };
}

// O certificado pode vir em base64 puro ou em PEM; devolvemos sempre os bytes.
function certificateBytes(value: string) {
  return Buffer.from(value.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
}

export async function discoverCertificate(id: Exclude<ProviderId, "TESTE">, accessToken: string) {
  const c = config(id);
  const result = await call<{ certificates?: { alias: string; certificate: string }[] }>(
    `${c.baseUrl}/oauth/certificate-discovery`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  const first = result.certificates?.[0];
  if (!first) throw new Error("Nenhum certificado encontrado nesta conta");
  return { alias: first.alias, chain: [certificateBytes(first.certificate)] };
}

export async function signDigest(
  id: Exclude<ProviderId, "TESTE">,
  p: { accessToken: string; alias: string; digest: Buffer; label: string },
) {
  const c = config(id);
  const result = await call<{ signatures: { id: string; raw_signature: string }[] }>(`${c.baseUrl}/oauth/signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      certificate_alias: p.alias,
      hashes: [
        { id: "1", alias: p.label, hash: p.digest.toString("hex") /* hexadecimal, conforme o manual do BirdID; confirmar na homologação */, hash_algorithm: SHA256_OID, signature_format: "RAW" },
      ],
    }),
  });
  const signature = result.signatures?.[0]?.raw_signature;
  if (!signature) throw new Error("O provedor não devolveu a assinatura");
  return Buffer.from(signature, "base64");
}
