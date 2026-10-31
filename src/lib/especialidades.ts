// Especialidades no hospital: quem responde um pedido de parecer. Sem acesso ao banco, para poder ser testado sozinho.
import { isDoctor, type ProfessionalUser } from "./hospital-roles";

type Answerer = ProfessionalUser & { id: string; specialty?: string | null };
type Consult = { specialty: string; consultantId: string | null };

// Mesma especialidade escrita de jeitos diferentes ("Cardiologia", " cardiologia ") conta como igual.
export function sameSpecialty(a: string | null | undefined, b: string | null | undefined) {
  const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return !!norm(a) && norm(a) === norm(b);
}

// Responde o parecer: o profissional escolhido no pedido ou qualquer um da especialidade pedida, com registro no conselho.
export function canAnswerConsult(user: Answerer, consult: Consult) {
  if (!(user.role === "PROFISSIONAL" || user.role === "ADMIN") || !user.councilNumber) return false;
  return consult.consultantId ? consult.consultantId === user.id : sameSpecialty(user.specialty, consult.specialty);
}

// Pedir parecer e transferir o paciente de especialidade são atos do médico (CRM).
export const canRequestConsult = isDoctor;
export const canTransferAttending = isDoctor;
// Assumir o paciente ao responder: só médico (passa a ser o médico responsável da internação).
export const canTakeOver = isDoctor;

export const consultStatusLabel = { PENDENTE: "Esperando resposta", RESPONDIDO: "Respondido", CANCELADO: "Cancelado" } as const;
