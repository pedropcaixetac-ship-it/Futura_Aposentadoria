"use client";

import { useEffect } from "react";
import { rememberInstitution } from "@/lib/remembered-institutions";

// Guarda neste aparelho a instituição em que a pessoa entrou, para aparecer no seletor do login.
export function RememberInstitution({ code, name }: { code: string; name: string }) {
  useEffect(() => rememberInstitution({ code, name }), [code, name]);
  return null;
}
