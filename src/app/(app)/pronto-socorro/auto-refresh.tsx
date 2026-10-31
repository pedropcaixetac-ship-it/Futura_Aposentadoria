"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Recarrega os dados da tela de tempos em tempos (painel do PS aberto o plantão todo).
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
