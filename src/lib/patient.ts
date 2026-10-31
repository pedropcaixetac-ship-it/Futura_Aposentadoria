import { age, isCalendarDate, isValidCns, isValidCpf, onlyDigits } from "./format";

// "completo": ficha inteira, com Nome, CPF, Celular (WhatsApp) e Data de nascimento obrigatórios.
// "rapido": só Nome, Data de nascimento e Celular, para a recepção completar depois.
export type RegistrationMode = "completo" | "rapido";

export const MARITAL_STATUS = ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"] as const;
export const REFERRAL_SOURCES = ["Indicação de paciente", "Indicação médica", "Convênio", "Google", "Instagram", "Facebook", "Passou na frente", "Outro"] as const;
export const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

const MAX_PHOTO_LENGTH = 400_000;

// Nome do paciente: mais que isso é texto colado por engano (e o banco não aceita nomes gigantes).
export const MAX_NAME = 150;

type Get = (key: string) => string | null;

function dateOrNull(value: string | null) {
  return isCalendarDate(value) ? new Date(`${value}T00:00:00Z`) : null;
}

export function readFormData(formData: FormData): Get {
  return (key) => {
    const value = String(formData.get(key) ?? "").trim();
    return value || null;
  };
}

export function parsePatient(get: Get, mode: RegistrationMode) {
  const digits = (key: string) => onlyDigits(get(key)) || null;
  const base = {
    name: (get("name") ?? "").replace(/\s+/g, " "),
    birthDate: dateOrNull(get("birthDate")),
    phone: digits("phone"),
    phoneWhatsapp: get("phoneWhatsapp") !== null,
    registrationComplete: mode === "completo",
  };
  if (mode === "rapido") return { ...base, cpf: digits("cpf") };

  const particular = get("insuranceType") !== "convenio";
  return {
    ...base,
    socialName: get("socialName"),
    sex: get("sex"),
    cpf: digits("cpf"),
    rg: get("rg"),
    cns: digits("cns"),
    motherName: get("motherName"),
    maritalStatus: get("maritalStatus"),
    occupation: get("occupation"),
    photo: get("photo"),
    landline: digits("landline"),
    email: get("email")?.toLowerCase() ?? null,
    emergencyContactName: get("emergencyContactName"),
    emergencyContactPhone: digits("emergencyContactPhone"),
    cep: digits("cep"),
    street: get("street"),
    number: get("number"),
    complement: get("complement"),
    district: get("district"),
    city: get("city"),
    state: get("state"),
    insurance: particular ? "Particular" : get("insurance"),
    // "outro" = convênio que ainda não está cadastrado na clínica; vale o nome digitado.
    healthPlanId: particular || get("healthPlanId") === "outro" ? null : get("healthPlanId"),
    insuranceNumber: particular ? null : get("insuranceNumber"),
    insuranceValidUntil: particular ? null : dateOrNull(get("insuranceValidUntil")),
    guardianName: get("guardianName"),
    guardianCpf: digits("guardianCpf"),
    guardianRelationship: get("guardianRelationship"),
    guardianPhone: digits("guardianPhone"),
    referralSource: get("referralSource"),
    notes: get("notes"),
  };
}

export type PatientInput = ReturnType<typeof parsePatient>;

const validPhone = (phone: string) => phone.length === 10 || phone.length === 11;

export function validatePatient(data: PatientInput, mode: RegistrationMode): string {
  if (data.name.length < 3 || !data.name.includes(" ")) return "Informe o nome completo do paciente (nome e sobrenome).";
  if (data.name.length > MAX_NAME) return `O nome pode ter até ${MAX_NAME} letras.`;
  if (!data.birthDate) return "Informe a data de nascimento.";
  if (data.birthDate > new Date()) return "A data de nascimento está no futuro.";
  if ((age(data.birthDate) ?? 0) > 130) return "Confira a data de nascimento.";
  if (!data.phone) return "Informe o celular (WhatsApp) do paciente.";
  if (!validPhone(data.phone)) return "Celular inválido: use DDD + número.";
  if (mode === "completo" && !data.cpf) return "Informe o CPF do paciente.";
  if (data.cpf && !isValidCpf(data.cpf)) return "CPF inválido. Confira os números.";
  if (!("cns" in data)) return "";

  if (data.cns && !isValidCns(data.cns)) return "Cartão SUS (CNS) inválido. Confira os 15 números.";
  if (data.landline && !validPhone(data.landline)) return "Telefone fixo inválido: use DDD + número.";
  if (data.emergencyContactPhone && !validPhone(data.emergencyContactPhone)) return "Telefone do contato de emergência inválido.";
  if (data.guardianPhone && !validPhone(data.guardianPhone)) return "Telefone do responsável inválido.";
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "E-mail inválido.";
  if (data.cep && data.cep.length !== 8) return "CEP inválido: são 8 números.";
  if (data.state && !UFS.includes(data.state)) return "Estado (UF) inválido.";
  if (data.guardianCpf && !isValidCpf(data.guardianCpf)) return "CPF do responsável inválido.";
  if (data.insurance !== "Particular" && !data.insurance) return "Informe o nome do convênio, ou marque Particular.";
  if (data.photo && (!data.photo.startsWith("data:image/") || data.photo.length > MAX_PHOTO_LENGTH)) return "Foto inválida ou grande demais.";
  return "";
}

// Mesmo nome e mesma data de nascimento: provavelmente é a mesma pessoa.
export function sameNameKey(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Busca pelo nome (ou nome social) sem ligar para acentos nem maiúsculas: "jose" acha "José".
export function patientNameWhere(term: string) {
  return { searchName: { contains: sameNameKey(term) } };
}
