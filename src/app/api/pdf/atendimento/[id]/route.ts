import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canOpenEncounter, canWorkClinical } from "@/lib/permissions";
import { hasTab } from "@/lib/tabs";
import { buildPdf } from "@/lib/pdf";
import { encounterPdfInput, pdfFileName } from "@/lib/pdf-content";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasTab(user, "pacientes") || !canWorkClinical(user)) return new NextResponse("Sem permissão", { status: 403 });

  const { id } = await params;
  const encounter = await prisma.encounter.findFirst({
    where: { id, clinicId: user.clinicId, status: "FINALIZADO" },
    include: {
      patient: true,
      professional: true,
      template: true,
      addenda: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!encounter) return new NextResponse("Atendimento não encontrado", { status: 404 });
  if (!canOpenEncounter(user, encounter)) return new NextResponse("Sem permissão", { status: 403 });

  const bytes = await buildPdf(encounterPdfInput(user.clinic.name, encounter, encounter.template?.name ?? null));
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "PDF_ATENDIMENTO_GERADO",
    entity: "Encounter",
    entityId: encounter.id,
    patientId: encounter.patientId,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName("atendimento", encounter.patient.name, encounter.startedAt)}"`,
      "Cache-Control": "no-store",
    },
  });
}
