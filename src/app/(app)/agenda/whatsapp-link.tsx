"use client";

import { useRouter } from "next/navigation";

// Abre o WhatsApp numa nova aba. Logo depois atualiza a tela, para aparecer
// "enviado às ..." na consulta.
export function WhatsappLink({ href, label, sentAt, small }: { href: string; label: string; sentAt?: string | null; small?: boolean }) {
  const router = useRouter();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setTimeout(() => router.refresh(), 1500)}
        className={
          small
            ? "rounded-md border border-emerald-500 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
            : "btn-primary bg-emerald-600! hover:bg-emerald-700!"
        }
      >
        {label}
      </a>
      {sentAt && <span className="text-xs text-emerald-700">✓ enviado {sentAt}</span>}
    </span>
  );
}
