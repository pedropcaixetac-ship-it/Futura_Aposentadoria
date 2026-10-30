"use client";

import { useState } from "react";
import { whatsappTemplates, type WhatsappTemplate } from "@/lib/whatsapp";

// Escolhe o texto e abre o WhatsApp numa nova aba, já com a mensagem escrita.
export function WhatsappButton({ patientId }: { patientId: string }) {
  const [modelo, setModelo] = useState<WhatsappTemplate>("contato");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Texto da mensagem"
        className="input w-auto!"
        value={modelo}
        onChange={(e) => setModelo(e.target.value as WhatsappTemplate)}
      >
        {Object.entries(whatsappTemplates).map(([key, t]) => (
          <option key={key} value={key}>{t.label}</option>
        ))}
      </select>
      <a
        href={`/pacientes/${patientId}/whatsapp?modelo=${modelo}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary bg-emerald-600! hover:bg-emerald-700!"
      >
        Enviar no WhatsApp
      </a>
    </div>
  );
}
