import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canEditWhatsappMessages } from "@/lib/tabs";
import { formatDateTime } from "@/lib/format";
import { MESSAGES, type MessageKey } from "@/lib/whatsapp";
import { saveWhatsappMessage } from "./actions";
import { MessageForm } from "./message-form";

export default async function WhatsappMessagesPage() {
  const user = await requireUser();
  if (!canEditWhatsappMessages(user)) notFound();
  const saved = await prisma.whatsappMessage.findMany({
    where: { clinicId: user.clinicId },
    include: { updatedBy: { select: { name: true } } },
  });
  const example = {
    paciente: "Maria",
    clinica: user.clinic.name,
    profissional: "Dra. Ana Souza",
    tipo: "consulta",
    dia: "31/10 (sexta)",
    hora: "14:00",
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/recepcao" className="text-sm text-marinho-700 hover:underline">← Recepção</Link>
        <h1 className="mt-1 text-2xl font-semibold">Mensagens do WhatsApp</h1>
        <p className="text-sm text-slate-500">
          Textos que aparecem prontos quando alguém clica para mandar WhatsApp a um paciente. As partes entre colchetes,
          como [paciente] e [hora], são trocadas sozinhas pelos dados de cada paciente. Não coloque informações de saúde
          (diagnóstico, exames, remédios) nas mensagens.
        </p>
      </div>

      {(Object.keys(MESSAGES) as MessageKey[]).map((key) => {
        const m = MESSAGES[key];
        const own = saved.find((s) => s.key === key);
        return (
          <MessageForm
            key={`${key}-${own?.updatedAt.getTime() ?? "padrao"}`}
            action={saveWhatsappMessage.bind(null, key)}
            label={m.label}
            where={m.where}
            fields={m.fields}
            text={own?.text ?? m.text}
            isDefault={!own}
            updatedInfo={own ? `Alterada por ${own.updatedBy.name} em ${formatDateTime(own.updatedAt)}` : null}
            example={example}
          />
        );
      })}
    </div>
  );
}
