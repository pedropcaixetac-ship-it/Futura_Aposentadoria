import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPdf } from "../src/lib/pdf";
import { signPdf } from "../src/lib/signature/pdf-sign";
import { certificateHolder, parseCertificate } from "../src/lib/signature/cms";
import { testCertificate } from "../src/lib/signature/test-certificate";
import { open, seal } from "../src/lib/signature/secret-box";

test("assina o PDF e a assinatura confere (certificado de teste)", async () => {
  const { chain, sign } = await testCertificate("Ana Souza", "12345678909");
  const holder = certificateHolder(parseCertificate(chain[0]));
  assert.equal(holder.cpf, "12345678909");
  assert.match(holder.name, /ANA SOUZA/);

  const pdf = await buildPdf({
    clinicName: "Clínica",
    title: "Atestado",
    info: ["Paciente: João"],
    sections: [{ text: "Atesto..." }],
    professional: { name: "Ana Souza" },
    place: "Hoje",
    signatureStamp: ["ASSINATURA DE TESTE", "Assinado por ANA SOUZA"],
  });
  const signed = await signPdf(pdf, holder.name, chain, sign);

  // O pdfsig (poppler) confere a assinatura de forma independente do nosso código.
  const dir = mkdtempSync(join(tmpdir(), "assinatura-"));
  const file = join(dir, "assinado.pdf");
  writeFileSync(file, signed);
  let output = "";
  try {
    output = execFileSync("pdfsig", [file], { encoding: "utf8" });
  } catch (error) {
    output = String((error as { stdout?: string }).stdout ?? "");
  }
  if (!output) return; // pdfsig não instalado nesta máquina
  assert.match(output, /Signature Validation: Signature is Valid/);
  assert.match(output, /ETSI\.CAdES\.detached/);
});

test("o acesso ao certificado é guardado cifrado", () => {
  process.env.ASSINATURA_CHAVE ??= "chave-de-teste";
  const sealed = seal("token-secreto");
  assert.ok(!sealed.includes("token-secreto"));
  assert.equal(open(sealed), "token-secreto");
});
