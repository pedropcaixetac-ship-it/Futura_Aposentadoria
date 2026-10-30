"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { consentText, councilLabel, teleconsultationState } from "@/lib/teleconsulta";

// O paciente aceita o termo. Guardamos o texto exato, a hora, o IP e o aparelho.
export async function acceptConsent(token: string, formData: FormData) {
  if (formData.get("aceito") !== "on") return;
  const t = await prisma.teleconsultation.findUnique({
    where: { token },
    include: { clinic: true, professional: true },
  });
  if (!t || teleconsultationState(t) !== "AGUARDANDO_TERMO") return;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
  const text = consentText({
    clinicName: t.clinic.name,
    professionalName: t.professional.name,
    council: councilLabel(t.professional),
  });
  const accepted = await prisma.teleconsultation.updateMany({
    where: { id: t.id, consentAt: null },
    data: { consentText: text, consentAt: new Date(), consentIp: ip, consentDevice: h.get("user-agent")?.slice(0, 300) ?? null },
  });
  if (accepted.count) {
    await audit({
      clinicId: t.clinicId,
      action: "TELECONSULTA_TERMO_ACEITO",
      entity: "Teleconsultation",
      entityId: t.id,
      patientId: t.patientId,
    });
  }
  revalidatePath(`/teleconsulta/${token}`);
}
