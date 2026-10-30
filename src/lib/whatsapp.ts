// Mensagens pelo WhatsApp. Nesta primeira etapa o sistema só abre o WhatsApp
// da recepção com o texto pronto (link wa.me); quem aperta "enviar" é a pessoa.
// Pela LGPD, as mensagens nunca levam informação clínica.

// Converte o telefone do cadastro para o formato internacional (55 + DDD + número).
// Devolve null se não parecer um telefone brasileiro válido.
export function whatsappNumber(phone: string | null | undefined) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^55[1-9][1-9]\d{8,9}$/.test(digits)) return null;
  return digits;
}

export const whatsappTemplates = {
  livre: { label: "Mensagem em branco", text: () => "" },
  contato: {
    label: "Contato da clínica",
    text: (v: TemplateVars) => `Olá, ${v.patient}! Aqui é da ${v.clinic}.`,
  },
  retorno: {
    label: "Aviso de retorno",
    text: (v: TemplateVars) =>
      `Olá, ${v.patient}! Aqui é da ${v.clinic}. Está chegando a hora do seu retorno. ` +
      "Responda esta mensagem para escolhermos o melhor dia e horário para você.",
  },
} as const;

export type WhatsappTemplate = keyof typeof whatsappTemplates;
type TemplateVars = { patient: string; clinic: string };

export function isWhatsappTemplate(value: string): value is WhatsappTemplate {
  return Object.hasOwn(whatsappTemplates, value);
}

// Usa só o primeiro nome do paciente, como numa conversa normal.
function firstName(name: string) {
  return name.trim().split(/\s+/)[0];
}

function waMe(phone: string, text: string) {
  const number = whatsappNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function whatsappLink(phone: string, template: WhatsappTemplate, vars: TemplateVars) {
  return waMe(phone, whatsappTemplates[template].text({ ...vars, patient: firstName(vars.patient) }));
}

// O botão só aparece com autorização do paciente e um celular que tenha WhatsApp.
export function canMessage(patient: { whatsappOptIn: boolean; phoneWhatsapp: boolean; phone: string | null }) {
  return patient.whatsappOptIn && patient.phoneWhatsapp && !!whatsappNumber(patient.phone);
}

// day no formato "31/10 (sexta)"; type em minúsculas: "consulta", "retorno".
type AppointmentVars = TemplateVars & { professional: string; type: string; day: string; time: string };

// Mensagens ligadas a uma consulta da agenda.
export const appointmentMessages = {
  confirmacao: (v: AppointmentVars) =>
    `Olá, ${v.patient}! Aqui é da ${v.clinic}. Você tem ${v.type} com ${v.professional} no dia ${v.day}, às ${v.time}. ` +
    "Você confirma sua presença? Se precisar remarcar, é só responder esta mensagem.",
  retorno: (v: TemplateVars & { professional: string }) =>
    `Olá, ${v.patient}! Aqui é da ${v.clinic}. Está chegando a hora do seu retorno com ${v.professional}. ` +
    "Responda esta mensagem para escolhermos o melhor dia e horário para você.",
} as const;

export function confirmationLink(phone: string, vars: AppointmentVars) {
  return waMe(phone, appointmentMessages.confirmacao({ ...vars, patient: firstName(vars.patient) }));
}

export function returnLink(phone: string, vars: TemplateVars & { professional: string }) {
  return waMe(phone, appointmentMessages.retorno({ ...vars, patient: firstName(vars.patient) }));
}
