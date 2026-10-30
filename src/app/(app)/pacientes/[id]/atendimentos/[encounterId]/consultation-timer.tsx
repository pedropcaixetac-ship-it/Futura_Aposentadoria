"use client";

import { useEffect, useState } from "react";

// Tempo desde o início do atendimento, atualizado a cada segundo.
export function ConsultationTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (now === null) return null;
  const total = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-marinho-800 px-2 py-1 font-mono text-sm text-dourado-300" title="Tempo de atendimento">
      ⏱ {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}
    </span>
  );
}
