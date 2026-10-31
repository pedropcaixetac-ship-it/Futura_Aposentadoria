// Quem pode o quê no hospital, pela profissão (perfil + conselho do cadastro).
// Estas regras seguem a lei de cada profissão: nenhuma permissão de aba muda, nem a do gerente.
// Tabela aprovada com Pedro: doc "Permissões do hospital: quem faz o quê" (31/10/2026).
import type { Role } from "@prisma/client";

export type ProfessionalUser = { role: Role | string; councilNumber?: string | null; councilType?: string | null; jobTitle?: string | null };

// Profissional de nível superior com registro no conselho (o gerente também, se tiver registro).
export function hasCouncil(user: ProfessionalUser, types: string[]) {
  return (user.role === "PROFISSIONAL" || user.role === "ADMIN") && !!user.councilNumber && !!user.councilType && types.includes(user.councilType);
}

export const isDoctor = (u: ProfessionalUser) => hasCouncil(u, ["CRM"]);
// Enfermeiro: COREN com perfil de profissional. Técnico e auxiliar de enfermagem têm perfil Técnico.
export const isNurse = (u: ProfessionalUser) => hasCouncil(u, ["COREN"]);
export const isPharmacist = (u: ProfessionalUser) => hasCouncil(u, ["CRF"]);

// Alta é ato médico (Lei 12.842/2013).
export const canDischarge = isDoctor;
// Classificação de risco: na enfermagem, só o enfermeiro (COFEN 661/2021); o médico também pode.
export const canTriage = (u: ProfessionalUser) => isNurse(u) || isDoctor(u);
// Aplicação de quimioterápico: privativa do enfermeiro (COFEN 569/2018).
export const canAdministerChemo = isNurse;
// Liberar ou reprovar carga da autoclave: enfermeiro responsável pela CME (RDC 15/2012).
export const canJudgeSterilization = isNurse;
// Resultado de análises clínicas: biomédico, farmacêutico ou médico.
export const canReleaseLabResult = (u: ProfessionalUser) => hasCouncil(u, ["CRBM", "CRF", "CRM"]);
// Ajuste de estoque e baixa de perda da farmácia: farmacêutico responsável ou o gerente.
export const canAdjustPharmacyStock = (u: ProfessionalUser) => isPharmacist(u) || u.role === "ADMIN";
// Medicamento controlado (Portaria 344/98): só o farmacêutico entrega.
export const canDispenseControlled = isPharmacist;
// CCIH: médicos e enfermeiros da comissão.
export const canWorkInfectionControl = (u: ProfessionalUser) => isDoctor(u) || isNurse(u);

// Abas hospitalares que cada cargo recebe ao ser cadastrado (o gerente muda pessoa por pessoa depois).
// null = cargo sem regra própria: vale o padrão do perfil.
export function hospitalTabsFor(u: ProfessionalUser): string[] | null {
  const base = ["chamados"];
  const council = u.councilNumber ? u.councilType : null;
  if (u.role === "PROFISSIONAL") {
    switch (council) {
      case "CRM": return [...base, "pronto-socorro", "internacao", "centro-cirurgico", "quimioterapia", "ccih", "laboratorio", "imagem"];
      case "COREN": return [...base, "pronto-socorro", "internacao", "centro-cirurgico", "cme", "quimioterapia", "ccih", "laboratorio"];
      case "CRF": return [...base, "farmacia", "laboratorio"];
      case "CRN": return [...base, "cozinha", "internacao"];
      case "CRBM": return [...base, "laboratorio"];
      case "CRTR": return [...base, "imagem"];
      case null: case undefined: return null;
      // Psicólogo, fisioterapeuta, fonoaudiólogo, dentista...: atendem os internados.
      default: return [...base, "internacao"];
    }
  }
  if (u.role === "TECNICO") {
    if (council === "COREN") return [...base, "pronto-socorro", "internacao", "centro-cirurgico", "cme"];
    if (council === "CRTR") return [...base, "imagem"];
    if (u.jobTitle === "Técnico(a) de laboratório") return [...base, "laboratorio"];
    return null;
  }
  if (u.role === "RECEPCAO") return [...base, "pronto-socorro", "visitas", "exames"];
  if (u.role === "ADMINISTRATIVO") return [...base, "internacao", "leitos", "almoxarifado", "manutencao", "contas"];
  return null;
}

// Dar entrada na internação (decisão de Pedro, 31/10): setor de internação (administrativo), enfermagem e médico,
// sempre com o médico responsável escolhido. Nutricionista, fisioterapeuta etc. veem os internados mas não internam.
export function canAdmit(u: ProfessionalUser) {
  if (u.role === "ADMIN" || u.role === "ADMINISTRATIVO") return true;
  if (u.role === "TECNICO") return !!u.councilNumber && u.councilType === "COREN";
  return isDoctor(u) || isNurse(u);
}
