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

// Mensagens padrão. Cada clínica pode reescrevê-las na Recepção, em
// "Mensagens do WhatsApp". As partes entre colchetes são preenchidas sozinhas.
export const MESSAGE_FIELDS = {
  paciente: "primeiro nome do paciente",
  clinica: "nome da clínica",
  profissional: "profissional (com Dr./Dra. quando for o caso)",
  tipo: "consulta, retorno ou procedimento",
  dia: "dia da consulta, ex.: 31/10 (sexta)",
  hora: "horário da consulta",
} as const;

export type MessageField = keyof typeof MESSAGE_FIELDS;

export const MESSAGES = {
  contato: {
    label: "Contato da clínica",
    where: "Botão \"Enviar no WhatsApp\" na ficha do paciente.",
    fields: ["paciente", "clinica"],
    text: "Olá, [paciente]! Aqui é da [clinica].",
  },
  confirmacao: {
    label: "Pedido de confirmação da consulta",
    where: "Botão \"Pedir confirmação\" na Recepção e na página da consulta.",
    fields: ["paciente", "clinica", "profissional", "tipo", "dia", "hora"],
    text:
      "Olá, [paciente]! Aqui é da [clinica]. Você tem [tipo] com [profissional] no dia [dia], às [hora]. " +
      "Você confirma sua presença? Se precisar remarcar, é só responder esta mensagem.",
  },
  retorno: {
    label: "Aviso de retorno",
    where: "\"Retornos para avisar\" na Recepção e a ficha do paciente.",
    fields: ["paciente", "clinica", "profissional"],
    text:
      "Olá, [paciente]! Aqui é da [clinica]. Está chegando a hora do seu retorno com [profissional]. " +
      "Responda esta mensagem para escolhermos o melhor dia e horário para você.",
  },
} satisfies Record<string, { label: string; where: string; fields: MessageField[]; text: string }>;

export type MessageKey = keyof typeof MESSAGES;
export type MessageTexts = Record<MessageKey, string>;

export function isMessageKey(value: string): value is MessageKey {
  return Object.hasOwn(MESSAGES, value);
}

export const MAX_MESSAGE_LENGTH = 1000;

// Usa só o primeiro nome do paciente, como numa conversa normal.
function firstName(name: string) {
  return name.trim().split(/\s+/)[0];
}

// Troca [paciente], [dia] etc. pelos valores. Colchetes desconhecidos ficam como estão.
export function fillMessage(text: string, values: Partial<Record<MessageField, string>>) {
  const filled = { ...values, ...(values.paciente && { paciente: firstName(values.paciente) }) };
  return text.replace(/\[(\w+)\]/g, (match, key: string) => filled[key as MessageField] ?? match);
}

// Colchetes que a mensagem usa mas que não existem para ela (ex.: [hora] no aviso de retorno).
export function unknownFields(key: MessageKey, text: string) {
  const allowed: readonly string[] = MESSAGES[key].fields;
  return [...new Set([...text.matchAll(/\[(\w+)\]/g)].map((m) => m[1]))].filter((f) => !allowed.includes(f));
}

export function whatsappUrl(phone: string | null | undefined, text: string) {
  const number = whatsappNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// O botão só aparece com autorização do paciente e um celular que tenha WhatsApp.
export function canMessage(patient: { whatsappOptIn: boolean; phoneWhatsapp: boolean; phone: string | null }) {
  return patient.whatsappOptIn && patient.phoneWhatsapp && !!whatsappNumber(patient.phone);
}
