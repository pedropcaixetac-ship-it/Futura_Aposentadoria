import { createHash } from "node:crypto";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

// Monta a assinatura no formato que vai dentro do PDF (CMS / PAdES).
// A chave do profissional nunca passa por aqui: o provedor (BirdID, VIDaaS)
// recebe só um resumo de 32 bytes e devolve a assinatura pronta.

const OID = {
  data: "1.2.840.113549.1.7.1",
  signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingCertificateV2: "1.2.840.113549.1.9.16.2.47",
  sha256: "2.16.840.1.101.3.4.2.1",
  rsaEncryption: "1.2.840.113549.1.1.1",
  sha256WithRsa: "1.2.840.113549.1.1.11",
};

export const SHA256_OID = OID.sha256;

// Recebe o resumo (SHA-256) e devolve a assinatura RSA PKCS#1 v1.5 crua.
export type RawSigner = (sha256Digest: Buffer) => Promise<Buffer>;

export function parseCertificate(der: Buffer) {
  const asn = asn1js.fromBER(new Uint8Array(der).buffer);
  if (asn.offset === -1) throw new Error("Certificado inválido");
  return new pkijs.Certificate({ schema: asn.result });
}

// Lê do certificado o nome e o CPF do titular. Nos certificados ICP-Brasil
// de pessoa física o nome vem como "NOME COMPLETO:12345678900".
export function certificateHolder(cert: pkijs.Certificate) {
  const cn = cert.subject.typesAndValues.find((tv) => tv.type === "2.5.4.3")?.value.valueBlock.value ?? "";
  const [name, cpf] = String(cn).split(":");
  return {
    name: name.trim(),
    cpf: cpf && /^\d{11}$/.test(cpf) ? cpf : null,
    serial: Buffer.from(cert.serialNumber.valueBlock.valueHexView).toString("hex"),
    notAfter: cert.notAfter.value,
  };
}

function attribute(type: string, value: asn1js.AsnType) {
  return new pkijs.Attribute({ type, values: [value] });
}

export async function buildCms(content: Buffer, chain: Buffer[], sign: RawSigner) {
  const [signerDer] = chain;
  const certificates = chain.map(parseCertificate);
  const signerCert = certificates[0];

  const essCertIdV2 = new asn1js.Sequence({
    value: [new asn1js.OctetString({ valueHex: new Uint8Array(createHash("sha256").update(signerDer).digest()).buffer })],
  });
  const signedAttrs = new pkijs.SignedAndUnsignedAttributes({
    type: 0,
    attributes: [
      attribute(OID.contentType, new asn1js.ObjectIdentifier({ value: OID.data })),
      attribute(
        OID.messageDigest,
        new asn1js.OctetString({ valueHex: new Uint8Array(createHash("sha256").update(content).digest()).buffer }),
      ),
      attribute(
        OID.signingCertificateV2,
        new asn1js.Sequence({ value: [new asn1js.Sequence({ value: [essCertIdV2] })] }),
      ),
    ],
  });

  // O que é assinado é o conjunto de atributos codificado como SET (0x31).
  const encodedAttrs = Buffer.from(signedAttrs.toSchema().toBER());
  encodedAttrs[0] = 0x31;
  const signature = await sign(createHash("sha256").update(encodedAttrs).digest());

  const signerInfo = new pkijs.SignerInfo({
    version: 1,
    sid: new pkijs.IssuerAndSerialNumber({ issuer: signerCert.issuer, serialNumber: signerCert.serialNumber }),
    digestAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID.sha256 }),
    signedAttrs,
    signatureAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID.rsaEncryption, algorithmParams: new asn1js.Null() }),
    signature: new asn1js.OctetString({ valueHex: new Uint8Array(signature).buffer }),
  });

  const signedData = new pkijs.SignedData({
    version: 1,
    digestAlgorithms: [new pkijs.AlgorithmIdentifier({ algorithmId: OID.sha256 })],
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: OID.data }),
    certificates,
    signerInfos: [signerInfo],
  });

  const contentInfo = new pkijs.ContentInfo({ contentType: OID.signedData, content: signedData.toSchema(true) });
  return Buffer.from(contentInfo.toSchema().toBER());
}
