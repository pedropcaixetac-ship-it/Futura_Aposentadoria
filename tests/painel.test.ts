import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidCnpj, parseClinic, slugError, suggestSlug, validateClinic, validateManager } from "../src/lib/painel";
import { teamChangeError, temporaryPassword } from "../src/lib/painel-equipe";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

test("código da clínica sugerido a partir do nome", () => {
  assert.equal(suggestSlug("Clínica São José"), "clinica-sao-jose");
  assert.equal(suggestSlug("  Consultório Dr. Ávila & Filhos "), "consultorio-dr-avila-filhos");
  assert.equal(slugError(suggestSlug("Clínica São José")), null);
});

test("código da clínica inválido ou reservado", () => {
  assert.ok(slugError("ab"));
  assert.ok(slugError("Clinica"));
  assert.ok(slugError("clínica"));
  assert.ok(slugError("com espaco"));
  assert.ok(slugError("-demo"));
  assert.ok(slugError("painel"));
  assert.equal(slugError("demo"), null);
});

test("CNPJ conferido pelos dígitos", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11.222.333/0001-82"), false);
  assert.equal(isValidCnpj("00000000000000"), false);
});

test("cadastro da clínica aceita CNPJ ou CPF e exige responsável", () => {
  const base = { name: "Clínica Teste", slug: "clinica-teste", contactName: "Maria" };
  assert.equal(validateClinic(parseClinic(form(base))), null);
  assert.equal(validateClinic(parseClinic(form({ ...base, cnpj: "11.222.333/0001-81" }))), null);
  assert.equal(validateClinic(parseClinic(form({ ...base, cnpj: "529.982.247-25" }))), null);
  assert.ok(validateClinic(parseClinic(form({ ...base, cnpj: "11.222.333/0001-00" }))));
  assert.ok(validateClinic(parseClinic(form({ ...base, contactName: "" }))));
  assert.equal(parseClinic(form({ ...base, slug: "Clinica-Teste" })).slug, "clinica-teste");
});

test("primeiro gerente precisa de e-mail e senha", () => {
  const ok = { name: "Maria", email: "maria@clinica.com", cpf: null, password: "12345678" };
  assert.equal(validateManager(ok), null);
  assert.ok(validateManager({ ...ok, email: "maria" }));
  assert.ok(validateManager({ ...ok, password: "123" }));
  assert.ok(validateManager({ ...ok, cpf: "11111111111" }));
});

test("senha provisória da equipe do painel", () => {
  const passwords = new Set(Array.from({ length: 50 }, () => temporaryPassword()));
  assert.equal(passwords.size, 50);
  for (const p of passwords) {
    assert.match(p, /^[A-Z]{3}[a-z]{3}-[2-9]{4}!$/);
    // Sem letras que se confundem ao ditar.
    assert.doesNotMatch(p, /[OIlo01]/);
  }
});

test("ninguém tira o próprio acesso nem o próprio papel de dono", () => {
  assert.ok(teamChangeError({ id: "a" }, { id: "a" }, "bloquear"));
  assert.ok(teamChangeError({ id: "a" }, { id: "a" }, "dono"));
  assert.equal(teamChangeError({ id: "a" }, { id: "b" }, "bloquear"), null);
});
