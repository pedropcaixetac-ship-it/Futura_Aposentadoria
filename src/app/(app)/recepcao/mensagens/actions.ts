"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canEditWhatsappMessages } from "@/lib/tabs";
import { MAX_MESSAGE_LENGTH, MESSAGES, isMessageKey, unknownFields } from "@/lib/whatsapp";
import { loadMessages } from "@/lib/whatsapp-data";

export type MessageFormState = { error: string; saved?: boolean };

// Salva o texto da clínica para uma mensagem padrão; "restaurar" volta ao texto do sistema.
export async function saveWhatsappMessage(key: string, _: MessageFormState, formData: FormData): Promise<MessageFormState> {
  const user = await requireUser();
  if (!canEditWhatsappMessages(user) || !isMessageKey(key)) return { error: "Sem permissão." };

  const before = (await loadMessages(user.clinicId))[key];
  const restore = formData.get("restore") !== null;
  const text = restore ? MESSAGES[key].text : String(formData.get("text") ?? "").trim();

  if (!restore) {
    if (!text) return { error: "Escreva a mensagem." };
    if (text.length > MAX_MESSAGE_LENGTH) return { error: `A mensagem pode ter no máximo ${MAX_MESSAGE_LENGTH} letras.` };
    const unknown = unknownFields(key, text);
    if (unknown.length) {
      return { error: `Esta mensagem não sabe preencher ${unknown.map((f) => `[${f}]`).join(", ")}. Use só as partes que aparecem acima do exemplo.` };
    }
  }

  // Igual ao padrão: não guarda cópia, para a clínica continuar recebendo melhorias do texto padrão.
  if (text === MESSAGES[key].text) {
    await prisma.whatsappMessage.deleteMany({ where: { clinicId: user.clinicId, key } });
  } else {
    await prisma.whatsappMessage.upsert({
      where: { clinicId_key: { clinicId: user.clinicId, key } },
      create: { clinicId: user.clinicId, key, text, updatedById: user.id },
      update: { text, updatedById: user.id },
    });
  }
  if (before !== text) {
    await audit({
      clinicId: user.clinicId,
      userId: user.id,
      action: "MENSAGEM_WHATSAPP_ALTERADA",
      entity: "WhatsappMessage",
      entityId: key,
      details: { mensagem: MESSAGES[key].label, antes: before, depois: text },
    });
  }
  revalidatePath("/recepcao/mensagens");
  return { error: "", saved: true };
}
