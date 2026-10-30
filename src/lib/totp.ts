import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Códigos de 6 números que mudam a cada 30 segundos (padrão TOTP, RFC 6238),
// os mesmos do Google Authenticator, Microsoft Authenticator, Authy etc.
const STEP_SECONDS = 30;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer) {
  let bits = "";
  for (const byte of buf) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return out;
}

function base32Decode(text: string) {
  let bits = "";
  for (const ch of text.replace(/[\s=]/g, "").toUpperCase()) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error("Segredo inválido");
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function newTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function currentStep(now = Date.now()) {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

export function totpCode(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}

// Aceita o código de agora e o de 30 segundos antes ou depois (relógio do celular adiantado ou atrasado).
// Devolve o passo usado, para o mesmo código não valer duas vezes; null se não confere.
export function verifyTotp(secret: string, code: string, lastStep: number | null, now = Date.now()) {
  const typed = code.replace(/\D/g, "");
  if (typed.length !== 6) return null;
  const step = currentStep(now);
  for (const s of [step - 1, step, step + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(totpCode(secret, s)), Buffer.from(typed))) return s;
  }
  return null;
}

// Endereço que o app lê pelo QR code.
export function totpUri(secret: string, account: string, issuer: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

// Códigos de recuperação, para quem perdeu o celular: cada um vale uma vez.
export function newRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)).slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

export function hashRecoveryCode(code: string) {
  return createHash("sha256").update(code.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
}

// Campos do usuário para desligar a verificação em duas etapas.
export const TWO_FACTOR_OFF = { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryCodes: [] as string[] };
