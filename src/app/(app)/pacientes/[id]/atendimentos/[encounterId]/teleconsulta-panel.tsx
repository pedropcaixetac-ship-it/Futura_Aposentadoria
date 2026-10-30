"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  link: string;
  patientName: string;
  phone: string | null;
  initialConsentAt: string | null;
  initialPatientJoinedAt: string | null;
  configured: boolean;
  status: () => Promise<{ consentAt: string | null; patientJoinedAt: string | null; ended: boolean }>;
  join: () => Promise<{ url?: string; error?: string }>;
  end: () => Promise<void>;
};

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

// Número brasileiro no formato do WhatsApp (55 + DDD + número).
function whatsappNumber(phone: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12) return digits;
  return "";
}

export function TeleconsultaPanel({ link, patientName, phone, initialConsentAt, initialPatientJoinedAt, configured, status, join, end }: Props) {
  const router = useRouter();
  const [consentAt, setConsentAt] = useState(initialConsentAt);
  const [patientJoinedAt, setPatientJoinedAt] = useState(initialPatientJoinedAt);
  const [callUrl, setCallUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  // Acompanha se o paciente já aceitou o termo e entrou, sem recarregar a página.
  useEffect(() => {
    if (consentAt && patientJoinedAt) return;
    const timer = setInterval(async () => {
      const s = await status().catch(() => null);
      if (!s) return;
      // Atualiza também o registro no prontuário quando algo muda.
      if (s.ended || s.consentAt !== consentAt || s.patientJoinedAt !== patientJoinedAt) router.refresh();
      setConsentAt(s.consentAt);
      setPatientJoinedAt(s.patientJoinedAt);
    }, 5000);
    return () => clearInterval(timer);
  }, [consentAt, patientJoinedAt, status, router]);

  const message = `Olá, ${patientName.split(" ")[0]}! Este é o link da sua teleconsulta: ${link}`;
  const wa = whatsappNumber(phone);

  return (
    <div className="no-print card space-y-3 lg:sticky lg:top-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-marinho-800">Teleconsulta</h2>
        <span className="rounded bg-dourado-100 px-2 py-0.5 text-xs text-dourado-700">Não é gravada</span>
      </div>

      {callUrl ? (
        <iframe
          src={callUrl}
          title="Chamada de vídeo"
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          className="aspect-[4/3] w-full rounded-md border-0 bg-marinho-950"
        />
      ) : (
        <>
          <div>
            <p className="label">Link para o paciente</p>
            <div className="flex gap-2">
              <input className="input font-mono text-xs" readOnly value={link} onFocus={(e) => e.target.select()} />
              <button
                type="button"
                className="btn-secondary shrink-0"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <a
              className="mt-2 inline-block text-sm text-marinho-700 hover:underline"
              href={`https://wa.me/${wa}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
            >
              Enviar pelo WhatsApp{wa ? "" : " (escolher contato)"}
            </a>
            <p className="mt-1 text-xs text-slate-500">O link vale por 24 horas.</p>
          </div>
        </>
      )}

      <ul className="space-y-1 text-sm">
        <li className={consentAt ? "text-emerald-700" : "text-slate-500"}>
          {consentAt ? `✓ Paciente aceitou o termo às ${time(consentAt)}` : "○ Aguardando o paciente abrir o link e aceitar o termo"}
        </li>
        <li className={patientJoinedAt ? "text-emerald-700" : "text-slate-500"}>
          {patientJoinedAt ? `✓ Paciente entrou na sala às ${time(patientJoinedAt)}` : "○ Paciente ainda não entrou na sala"}
        </li>
      </ul>

      {!configured && (
        <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">
          O vídeo ainda não está ativado: falta configurar a chave da Daily (DAILY_API_KEY).
        </p>
      )}
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {!callUrl && configured && (
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await join();
                if (r.url) setCallUrl(r.url);
                else setError(r.error ?? "Erro ao entrar na chamada");
              })
            }
          >
            {pending ? "Abrindo..." : "Entrar na chamada"}
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() => {
            if (!confirm("Encerrar a teleconsulta? A chamada termina para todos e o link deixa de funcionar.")) return;
            startTransition(async () => {
              await end();
              setCallUrl(null);
              router.refresh();
            });
          }}
        >
          Encerrar teleconsulta
        </button>
      </div>
    </div>
  );
}
