"use client";

import { useEffect, useRef, useState } from "react";

// Leitor de código de barras pela câmera (celular ou notebook), usando o recurso do próprio navegador.
// Funciona no Chrome e no Edge (inclusive no Android). Onde não houver, o botão não aparece.
type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorClass = new (options: { formats: string[] }) => Detector;

function detectorClass() {
  return typeof window !== "undefined" ? (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector : undefined;
}

export function BarcodeScanner({ onRead }: { onRead: (value: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  useEffect(() => setSupported(Boolean(detectorClass() && navigator.mediaDevices?.getUserMedia)), []);

  useEffect(() => {
    if (!open) return;
    const Barcode = detectorClass();
    if (!Barcode) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const detector = new Barcode({ formats: ["code_128", "qr_code"] });

    async function scan() {
      if (stopped || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        // O código de barras do DANFE é a chave de acesso; o QR code da NFC-e traz a chave no endereço.
        const key = codes.map((c) => c.rawValue.match(/\d{44}/)?.[0]).find(Boolean);
        if (key) {
          onReadRef.current(key);
          setOpen(false);
          return;
        }
      } catch {
        // Quadro ainda não pronto; tenta no próximo.
      }
      frame = requestAnimationFrame(scan);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (s) => {
        stream = s;
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = s;
        await videoRef.current.play();
        scan();
      })
      .catch(() => {
        setError("Não foi possível abrir a câmera. Confira se o navegador tem permissão para usá-la.");
        setOpen(false);
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  if (!supported) return null;
  return (
    <div className="space-y-2">
      <button type="button" className="btn-secondary" onClick={() => { setError(""); setOpen((v) => !v); }}>
        {open ? "Fechar câmera" : "Ler código de barras com a câmera"}
      </button>
      {open && (
        <div className="space-y-1">
          <video ref={videoRef} className="w-full max-w-md rounded-md bg-black" muted playsInline />
          <p className="text-xs text-slate-500">Aponte para o código de barras do DANFE (a nota em papel). A leitura é automática.</p>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
