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
export function whatsappLink(phone: string, template: WhatsappTemplate, vars: TemplateVars) {
  const number = whatsappNumber(phone);
  if (!number) return null;
  const firstName = vars.patient.trim().split(/\s+/)[0];
  const text = whatsappTemplates[template].text({ ...vars, patient: firstName });
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
