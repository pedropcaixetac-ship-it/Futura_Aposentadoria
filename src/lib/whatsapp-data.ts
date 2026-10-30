// Mensagens do WhatsApp guardadas no banco: o texto da clínica ou, se ela não mudou, o padrão.
import { prisma } from "./db";
import { MESSAGES, isMessageKey, type MessageTexts } from "./whatsapp";

export async function loadMessages(clinicId: string): Promise<MessageTexts> {
  const saved = await prisma.whatsappMessage.findMany({ where: { clinicId } });
  const texts = Object.fromEntries(Object.entries(MESSAGES).map(([key, m]) => [key, m.text])) as MessageTexts;
  for (const m of saved) if (isMessageKey(m.key)) texts[m.key] = m.text;
  return texts;
}
