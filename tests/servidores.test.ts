import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTab, sanitizeTabs, userTabs } from "../src/lib/tabs";
import { parseStaff, staffFunction, validateStaff } from "../src/lib/staff";

const padrao = { customTabs: false, allowedTabs: [] as string[] };
const medica = { id: "m1", role: "PROFISSIONAL" as const, councilNumber: "123", ...padrao };
const recepcao = { id: "r1", role: "RECEPCAO" as const, councilNumber: null, ...padrao };
const admin = { id: "a1", role: "ADMIN" as const, councilNumber: null, ...padrao };

test("sem permissões personalizadas valem as abas padrão do perfil", () => {
  assert.deepEqual(userTabs(medica).map((t) => t.key), ["agenda", "pacientes", "modelos", "textos-prontos", "assinatura", "financeiro"]);
  assert.deepEqual(userTabs(recepcao).map((t) => t.key), ["recepcao", "agenda", "pacientes", "financeiro"]);
  assert.deepEqual(userTabs(admin).map((t) => t.key), ["recepcao", "agenda", "pacientes", "modelos", "financeiro", "contabilidade", "auditoria", "servidores"]);
});

test("o administrador escolhe as abas de cada pessoa", () => {
  const semFinanceiro = { ...medica, customTabs: true, allowedTabs: ["pacientes", "textos-prontos"] };
  assert.equal(hasTab(semFinanceiro, "financeiro"), false);
  assert.equal(hasTab(semFinanceiro, "textos-prontos"), true);
  const recepcaoComAuditoria = { ...recepcao, customTabs: true, allowedTabs: ["pacientes", "auditoria"] };
  assert.equal(hasTab(recepcaoComAuditoria, "auditoria"), true);
});

test("permissão não libera conteúdo clínico nem o cadastro de servidores para quem não pode", () => {
  const tentativa = { ...recepcao, customTabs: true, allowedTabs: ["textos-prontos", "modelos", "servidores"] };
  assert.equal(hasTab(tentativa, "textos-prontos"), false);
  assert.equal(hasTab(tentativa, "servidores"), false);
  assert.deepEqual(sanitizeTabs(recepcao, ["pacientes", "textos-prontos", "servidores", "inventada"]), ["pacientes"]);
});

test("administrador continua com todas as abas mesmo com lista vazia", () => {
  assert.equal(hasTab({ ...admin, customTabs: true, allowedTabs: [] }, "servidores"), true);
});

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

test("valida o cadastro de servidor", () => {
  const base = { name: "Maria da Silva", email: "Maria@Clinica.com", role: "RECEPCAO", password: "senha1234", systemAccess: "on" };
  const ok = parseStaff(form({ ...base, cpf: "529.982.247-25" }));
  assert.equal(ok.email, "maria@clinica.com");
  assert.equal(ok.cpf, "52998224725");
  assert.equal(validateStaff(ok, { needsPassword: true }), null);

  assert.match(validateStaff(parseStaff(form({ ...base, name: "Maria" })), { needsPassword: true })!, /nome completo/);
  assert.match(validateStaff(parseStaff(form({ ...base, cpf: "111.111.111-11" })), { needsPassword: true })!, /CPF/);
  assert.match(validateStaff(parseStaff(form({ ...base, role: "DONO" })), { needsPassword: true })!, /perfil/);
  assert.match(validateStaff(parseStaff(form({ ...base, password: "" })), { needsPassword: true })!, /senha/);
  assert.equal(validateStaff(parseStaff(form({ ...base, password: "" })), { needsPassword: false }), null);
  assert.match(validateStaff(parseStaff(form({ ...base, councilNumber: "123" })), { needsPassword: true })!, /conselho/);
});

test("quem não usa o sistema entra no cadastro sem e-mail nem senha", () => {
  const limpeza = parseStaff(form({ name: "José Pereira", jobTitle: "Auxiliar de limpeza", role: "ADMIN", password: "qualquer1" }));
  assert.equal(limpeza.systemAccess, false);
  assert.equal(limpeza.role, "RECEPCAO");
  assert.equal(limpeza.password, null);
  assert.equal(validateStaff(limpeza, { needsPassword: true }), null);
  const comAcesso = parseStaff(form({ name: "José Pereira", role: "RECEPCAO", password: "senha1234", systemAccess: "on" }));
  assert.match(validateStaff(comAcesso, { needsPassword: true })!, /e-mail/);
});

test("coluna Função usa o cargo ou, sem ele, o perfil", () => {
  assert.equal(staffFunction({ jobTitle: "Médica", role: "PROFISSIONAL" }), "Médica");
  assert.equal(staffFunction({ jobTitle: null, role: "RECEPCAO" }), "Recepção");
});
