import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTab, sanitizeTabs, userTabs } from "../src/lib/tabs";
import { clinicalLoginBlock, councilLabel, displayName, parseStaff, staffEditBlock, staffFunction, validateNewPassword, validateStaff } from "../src/lib/staff";
import { canOpenEncounter, canSeeAllAgendas, canViewClinical, canWorkClinical } from "../src/lib/permissions";

const padrao = { customTabs: false, allowedTabs: [] as string[] };
const medica = { id: "m1", role: "PROFISSIONAL" as const, councilNumber: "123", ...padrao };
const recepcao = { id: "r1", role: "RECEPCAO" as const, councilNumber: null, ...padrao };
const admin = { id: "a1", role: "ADMIN" as const, councilNumber: null, ...padrao };
const administrativo = { id: "ad1", role: "ADMINISTRATIVO" as const, councilNumber: null, ...padrao };

test("sem permissões personalizadas valem as abas padrão do perfil", () => {
  assert.deepEqual(userTabs(medica).map((t) => t.key), ["atender", "agenda", "pacientes", "modelos", "textos-prontos", "assinatura", "meu-financeiro"]);
  assert.deepEqual(userTabs(recepcao).map((t) => t.key), ["recepcao", "agenda", "pacientes", "financeiro"]);
  assert.deepEqual(userTabs(admin).map((t) => t.key), ["recepcao", "agenda", "pacientes", "modelos", "financeiro", "contabilidade", "auditoria", "servidores"]);
  assert.deepEqual(userTabs(administrativo).map((t) => t.key), ["recepcao", "agenda", "pacientes", "financeiro", "contabilidade", "servidores"]);
});

test("Financeiro é da administração; Meu financeiro é dos profissionais", () => {
  assert.equal(hasTab(administrativo, "financeiro"), true);
  assert.equal(hasTab(administrativo, "meu-financeiro"), false);
  // Mesmo liberada à mão, a aba Financeiro não aparece para o profissional de saúde.
  assert.equal(hasTab({ ...medica, customTabs: true, allowedTabs: ["financeiro"] }, "financeiro"), false);
  // O administrador que também atende (tem conselho) fica com as duas.
  const adminMedico = { ...admin, councilNumber: "999" };
  assert.equal(hasTab(adminMedico, "financeiro"), true);
  assert.equal(hasTab(adminMedico, "meu-financeiro"), true);
});

test("o administrador escolhe as abas de cada pessoa", () => {
  const semFinanceiro = { ...medica, customTabs: true, allowedTabs: ["pacientes", "textos-prontos"] };
  assert.equal(hasTab(semFinanceiro, "financeiro"), false);
  assert.equal(hasTab(semFinanceiro, "textos-prontos"), true);
  // Recepção e Cadastro de servidores podem ser liberados para qualquer pessoa.
  const medicaNaRecepcao = { ...medica, customTabs: true, allowedTabs: ["pacientes", "recepcao", "servidores"] };
  assert.equal(hasTab(medicaNaRecepcao, "recepcao"), true);
  assert.equal(hasTab(medicaNaRecepcao, "servidores"), true);
  assert.equal(canSeeAllAgendas(medicaNaRecepcao), true);
  assert.equal(canSeeAllAgendas(medica), false);
});

test("permissão não libera conteúdo clínico nem a auditoria para quem não pode", () => {
  const tentativa = { ...recepcao, customTabs: true, allowedTabs: ["textos-prontos", "modelos", "auditoria", "servidores"] };
  assert.equal(hasTab(tentativa, "textos-prontos"), false);
  assert.equal(hasTab(tentativa, "auditoria"), false);
  assert.equal(hasTab(tentativa, "servidores"), true);
  assert.deepEqual(sanitizeTabs(recepcao, ["pacientes", "textos-prontos", "auditoria", "servidores", "inventada"]), ["pacientes", "servidores"]);
  // A auditoria é só do gerente do sistema.
  assert.equal(hasTab({ ...administrativo, customTabs: true, allowedTabs: ["auditoria"] }, "auditoria"), false);
  assert.equal(hasTab(admin, "auditoria"), true);
});

test("quem não é gerente do sistema não mexe em gerentes nem no próprio cadastro", () => {
  assert.equal(staffEditBlock(administrativo, recepcao, "RECEPCAO"), null);
  assert.equal(staffEditBlock(administrativo, null, "PROFISSIONAL"), null);
  assert.match(staffEditBlock(administrativo, null, "ADMIN")!, /gerente/);
  assert.match(staffEditBlock(administrativo, admin)!, /gerente/);
  assert.match(staffEditBlock(administrativo, administrativo)!, /próprio/);
  assert.equal(staffEditBlock(admin, admin, "ADMIN"), null);
});

test("só o gerente cria ou altera o login de profissional de saúde", () => {
  const login = { role: "PROFISSIONAL" as const, systemAccess: true, email: "ana@x.com", cpf: "52998224725", councilType: "CRM", councilNumber: "123", councilUf: "SP" };
  const semMudar = { ...login, password: null };
  // Administração não cria login clínico nem troca a senha ou o e-mail de quem tem.
  assert.match(clinicalLoginBlock(administrativo, null, semMudar)!, /gerente/);
  assert.match(clinicalLoginBlock(administrativo, login, { ...semMudar, password: "Nova@Senha1" })!, /gerente/);
  assert.match(clinicalLoginBlock(administrativo, login, { ...semMudar, email: "eu@x.com" })!, /gerente/);
  assert.match(clinicalLoginBlock(administrativo, { ...login, role: "RECEPCAO" }, semMudar)!, /gerente/);
  // Pode cadastrar sem login, mexer nos outros dados e tirar o acesso.
  assert.equal(clinicalLoginBlock(administrativo, null, { ...semMudar, systemAccess: false }), null);
  assert.equal(clinicalLoginBlock(administrativo, login, semMudar), null);
  assert.equal(clinicalLoginBlock(administrativo, login, { ...semMudar, systemAccess: false }), null);
  assert.equal(clinicalLoginBlock(admin, null, semMudar), null);
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
  const base = {
    name: "Maria da Silva", email: "Maria@Clinica.com", role: "RECEPCAO", password: "senha1234", systemAccess: "on",
    birthDate: "1990-05-10", phone: "(62) 99999-0000",
  };
  const ok = parseStaff(form({ ...base, cpf: "529.982.247-25" }));
  assert.equal(ok.email, "maria@clinica.com");
  assert.equal(ok.cpf, "52998224725");
  assert.equal(validateStaff(ok, { needsPassword: true }), null);

  assert.match(validateStaff(parseStaff(form({ ...base, name: "Maria" })), { needsPassword: true })!, /nome completo/);
  assert.match(validateStaff(parseStaff(form({ ...base, cpf: "111.111.111-11" })), { needsPassword: true })!, /CPF/);
  const comCpf = { ...base, cpf: "529.982.247-25" };
  assert.match(validateStaff(parseStaff(form({ ...base })), { needsPassword: true })!, /CPF/);
  assert.match(validateStaff(parseStaff(form({ ...comCpf, birthDate: "" })), { needsPassword: true })!, /nascimento/);
  assert.match(validateStaff(parseStaff(form({ ...comCpf, phone: "" })), { needsPassword: true })!, /celular/);
  assert.match(validateStaff(parseStaff(form({ ...comCpf, cns: "123" })), { needsPassword: true })!, /CNS/);
  assert.match(validateStaff(parseStaff(form({ ...base, cpf: "529.982.247-25", role: "DONO" })), { needsPassword: true })!, /perfil/);
  assert.match(validateStaff(parseStaff(form({ ...base, cpf: "529.982.247-25", password: "" })), { needsPassword: true })!, /senha/);
  assert.equal(validateStaff(parseStaff(form({ ...base, cpf: "529.982.247-25", password: "" })), { needsPassword: false }), null);
  assert.match(validateStaff(parseStaff(form({ ...base, cpf: "529.982.247-25", councilNumber: "123" })), { needsPassword: true })!, /conselho/);
});

test("quem não usa o sistema entra no cadastro sem e-mail nem senha", () => {
  const pessoa = { name: "José Pereira", cpf: "529.982.247-25", birthDate: "1980-01-01", phone: "62999990000" };
  const limpeza = parseStaff(form({ ...pessoa, jobTitle: "Auxiliar de limpeza", role: "ADMIN", password: "qualquer1" }));
  assert.equal(limpeza.systemAccess, false);
  assert.equal(limpeza.role, "RECEPCAO");
  assert.equal(limpeza.password, null);
  assert.equal(validateStaff(limpeza, { needsPassword: true }), null);
  const comAcesso = parseStaff(form({ ...pessoa, role: "RECEPCAO", password: "senha1234", systemAccess: "on" }));
  assert.match(validateStaff(comAcesso, { needsPassword: true })!, /e-mail/);
});

test("coluna Função usa o cargo ou, sem ele, o perfil", () => {
  assert.equal(staffFunction({ jobTitle: "Médica", role: "PROFISSIONAL" }), "Médica");
  assert.equal(staffFunction({ jobTitle: null, role: "RECEPCAO" }), "Recepção");
});

test("Dr./Dra. vem da função: médicos, psicólogos e dentistas", () => {
  assert.equal(displayName({ name: "Pedro Caixeta", jobTitle: "Médico(a)", sex: null }), "Dr. Pedro Caixeta");
  assert.equal(displayName({ name: "Ana Souza", jobTitle: "Médico(a)", sex: "F" }), "Dra. Ana Souza");
  assert.equal(displayName({ name: "Carla Dias", jobTitle: "Psicólogo(a)", sex: "F" }), "Dra. Carla Dias");
  assert.equal(displayName({ name: "Rui Melo", jobTitle: "Cirurgião(ã)-dentista", sex: "M" }), "Dr. Rui Melo");
  // Funções digitadas à mão antes das listas prontas.
  assert.equal(displayName({ name: "Ana Souza", jobTitle: "Médica", sex: null }), "Dra. Ana Souza");
  assert.equal(displayName({ name: "Rui Melo", jobTitle: "Dentista", sex: null }), "Dr. Rui Melo");
  // Demais funções nunca têm título.
  for (const jobTitle of ["Auxiliar administrativo", "Enfermeiro(a)", "Fisioterapeuta", "Nutricionista", "Técnico(a) de enfermagem", null]) {
    assert.equal(displayName({ name: "Maria Lima", jobTitle, sex: "F" }), "Maria Lima");
  }
});

test("Dr. digitado no nome é retirado ao salvar", () => {
  assert.equal(parseStaff(form({ name: "Dr. Pedro Caixeta" })).name, "Pedro Caixeta");
  assert.equal(parseStaff(form({ name: "dra Ana Souza" })).name, "Ana Souza");
  assert.equal(parseStaff(form({ name: "Drummond Silva" })).name, "Drummond Silva");
});

test("saúde com acesso restrito: só os próprios atendimentos", () => {
  const tecnica = { id: "t1", role: "TECNICO" as const, councilNumber: "555", ...padrao };
  assert.equal(canViewClinical(tecnica), false);
  assert.equal(canWorkClinical(tecnica), true);
  assert.equal(canOpenEncounter(tecnica, { professionalId: "t1" }), true);
  assert.equal(canOpenEncounter(tecnica, { professionalId: "m1" }), false);
  assert.equal(canOpenEncounter(medica, { professionalId: "t1" }), true);
  assert.equal(hasTab(tecnica, "assinatura"), false);
  assert.equal(hasTab(tecnica, "textos-prontos"), true);
});

test("troca da própria senha em Meu cadastro", () => {
  assert.equal(validateNewPassword("antiga123", "novaSenha9", "novaSenha9"), null);
  assert.match(validateNewPassword("antiga123", "curta", "curta")!, /8 caracteres/);
  assert.match(validateNewPassword("antiga123", "novaSenha9", "outraSenha")!, /confirmação/);
  assert.match(validateNewPassword("antiga123", "antiga123", "antiga123")!, /diferente/);
});

test("RQE do médico especialista sai junto com o CRM", () => {
  const base = { name: "Ana Souza", cpf: "529.982.247-25", birthDate: "1985-01-01", phone: "62999990000", councilNumber: "123456", councilUf: "SP" };
  const medica = parseStaff(form({ ...base, councilType: "CRM", rqe: "RQE nº 12345; 678" }));
  assert.equal(medica.rqe, "12345, 678");
  assert.equal(validateStaff(medica, { needsPassword: false }), null);
  assert.equal(councilLabel(medica), "CRM 123456/SP · RQE 12345, 678");
  // Outros conselhos não têm RQE.
  assert.equal(parseStaff(form({ ...base, councilType: "COREN", rqe: "12345" })).rqe, null);
  assert.match(validateStaff(parseStaff(form({ ...base, councilType: "CRM", rqe: "abc" })), { needsPassword: false })!, /RQE/);
  assert.match(validateStaff(parseStaff(form({ ...base, councilNumber: "", councilType: "CRM", rqe: "12345" })), { needsPassword: false })!, /CRM/);
  assert.equal(councilLabel({ councilType: "CRP", councilNumber: "06/98765", councilUf: "SP", rqe: null }), "CRP 06/98765/SP");
});
