import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordProblem } from "../src/lib/password";
import { currentStep, hashRecoveryCode, newRecoveryCodes, newTotpSecret, totpCode, totpUri, verifyTotp } from "../src/lib/totp";

test("senha: maiúscula, minúscula, número, símbolo e 10 caracteres", () => {
  assert.equal(passwordProblem("Clinica#2026"), null);
  assert.match(passwordProblem("Cl#2026a")!, /10 caracteres/);
  assert.match(passwordProblem("clinica#2026")!, /maiúscula/);
  assert.match(passwordProblem("CLINICA#2026")!, /minúscula/);
  assert.match(passwordProblem("Clinica#Boa!")!, /número/);
  assert.match(passwordProblem("Clinica20261")!, /símbolo/);
});

test("senha não pode ter nome, e-mail, CPF ou nascimento", () => {
  const ana = { name: "Ana Souza", email: "anasouza@demo.com", cpf: "529.982.247-25", birthDate: new Date("1985-05-10") };
  assert.match(passwordProblem("Souza#20261", ana)!, /nome/);
  assert.match(passwordProblem("Anasouza#2026", ana)!, /nome/);
  assert.match(passwordProblem("Xy#529982abc", ana)!, /CPF/);
  assert.match(passwordProblem("Xy#10051985k", ana)!, /nascimento/);
  assert.equal(passwordProblem("Clinica#2026", ana), null);
});

test("TOTP confere com o exemplo oficial da RFC 6238", () => {
  // Segredo "12345678901234567890" em base32; em 59 s o código de 8 dígitos é 94287082 (6 últimos: 287082).
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totpCode(secret, currentStep(59_000)), "287082");
});

test("código vale 30 s antes ou depois e não pode ser usado duas vezes", () => {
  const secret = newTotpSecret();
  const now = Date.now();
  const step = currentStep(now);
  assert.equal(verifyTotp(secret, totpCode(secret, step), null, now), step);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 1), null, now), step - 1);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 3), null, now), null);
  assert.equal(verifyTotp(secret, totpCode(secret, step), step, now), null);
  assert.equal(verifyTotp(secret, "12345", null, now), null);
});

test("QR code e códigos de recuperação", () => {
  assert.match(totpUri("ABC", "ana@demo.com", "Clínica Demo"), /^otpauth:\/\/totp\/Cl%C3%ADnica%20Demo%3Aana%40demo\.com\?secret=ABC&issuer=/);
  const codes = newRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  assert.equal(hashRecoveryCode(codes[0].toLowerCase().replace("-", " ")), hashRecoveryCode(codes[0]));
});
