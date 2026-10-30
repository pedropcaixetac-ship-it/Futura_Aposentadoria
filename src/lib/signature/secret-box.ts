import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Cifra o acesso ao certificado antes de guardar no banco. A chave vem de
// ASSINATURA_CHAVE; se ela não existir, usa o endereço do banco, que também
// é segredo e nunca fica gravado dentro do próprio banco.
function key() {
  const secret = process.env.ASSINATURA_CHAVE ?? process.env.DATABASE_URL;
  if (!secret) throw new Error("Defina ASSINATURA_CHAVE");
  return createHash("sha256").update(`assinatura:${secret}`).digest();
}

export function seal(text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function open(sealed: string) {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
