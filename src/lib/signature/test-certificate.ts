import { constants, createPrivateKey, privateEncrypt, webcrypto } from "node:crypto";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import type { RawSigner } from "./cms";

// Certificado de TESTE, criado na hora, para experimentar a assinatura sem um
// certificado de verdade. A assinatura funciona igual, mas não tem validade
// jurídica: nenhum validador ICP-Brasil reconhece este certificado.

const crypto = webcrypto as unknown as Crypto;
pkijs.setEngine("node", new pkijs.CryptoEngine({ name: "node", crypto }));

const cache = new Map<string, Promise<{ chain: Buffer[]; sign: RawSigner }>>();

export function testCertificate(holderName: string, cpf: string | null) {
  const cn = `${holderName.toUpperCase()} (TESTE):${cpf ?? "00000000000"}`;
  if (!cache.has(cn)) cache.set(cn, create(cn));
  return cache.get(cn)!;
}

async function create(cn: string) {
  const algorithm = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
  const keys = (await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"])) as CryptoKeyPair;

  const cert = new pkijs.Certificate();
  cert.version = 2;
  cert.serialNumber = new asn1js.Integer({ value: Date.now() % 2147483647 });
  const name = [
    new pkijs.AttributeTypeAndValue({ type: "2.5.4.6", value: new asn1js.PrintableString({ value: "BR" }) }),
    new pkijs.AttributeTypeAndValue({ type: "2.5.4.10", value: new asn1js.Utf8String({ value: "CERTIFICADO DE TESTE - SEM VALIDADE" }) }),
    new pkijs.AttributeTypeAndValue({ type: "2.5.4.3", value: new asn1js.Utf8String({ value: cn }) }),
  ];
  cert.issuer.typesAndValues = name;
  cert.subject.typesAndValues = name;
  cert.notBefore.value = new Date(Date.now() - 60_000);
  cert.notAfter.value = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  await cert.subjectPublicKeyInfo.importKey(keys.publicKey);
  await cert.sign(keys.privateKey, "SHA-256");
  const der = Buffer.from(cert.toSchema(true).toBER());

  // O provedor real recebe só o resumo; aqui imitamos isso assinando o
  // DigestInfo (SHA-256 + resumo) com RSA PKCS#1 v1.5.
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const digestInfoPrefix = Buffer.from("3031300d060960864801650304020105000420", "hex");
  const sign: RawSigner = async (digest) =>
    privateEncrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.concat([digestInfoPrefix, digest]));

  return { chain: [der], sign };
}
