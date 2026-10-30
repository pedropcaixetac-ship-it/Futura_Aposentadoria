"use client";

import { useEffect, useRef, useState } from "react";

// Ditado por voz com o reconhecimento de fala do próprio navegador (Chrome, Edge e Safari).
// Tipos mínimos, porque o TypeScript ainda não traz a Web Speech API.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function DictationButton({ onText }: { onText: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(!!getRecognition());
    return () => recognition.current?.stop();
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = getRecognition();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
      }
    };
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Libere o microfone no navegador." : "O ditado parou. Tente de novo.");
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    setError("");
    setListening(true);
    r.start();
  };

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={toggle}
        title={listening ? "Parar o ditado" : "Ditar por voz"}
        className={`rounded border px-2 py-0.5 text-xs font-medium ${
          listening ? "animate-pulse border-red-500 bg-red-50 text-red-700" : "border-marinho-400 text-marinho-700 hover:bg-marinho-50"
        }`}
      >
        {listening ? "● Ouvindo… parar" : "🎤 Ditar"}
      </button>
    </span>
  );
}
