import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canViewClinical } from "@/lib/permissions";
import { hasTab } from "@/lib/tabs";
import { buildPdf } from "@/lib/pdf";
import { pdfFileName, recordPdfInput } from "@/lib/pdf-content";

// PDF do prontuário inteiro do paciente. Só quem tem acesso completo ao prontuário,
// e só atendimentos finalizados (rascunhos ainda podem mudar).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasTab(user, "pacientes") || !canViewClinical(user)) return new NextResponse("Sem permissão", { status: 403 });

  const { id } = await params;
  const patient = await prisma.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!patient) return new NextResponse("Paciente não encontrado", { status: 404 });

  const encounters = await prisma.encounter.findMany({
    where: { patientId: id, clinicId: user.clinicId, status: "FINALIZADO" },
    include: {
      professional: true,
      addenda: { include: { author: true }, orderBy: { createdAt: "asc" } },
      documents: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { startedAt: "asc" },
  });

  const bytes = await buildPdf(recordPdfInput(user.clinic.name, patient, encounters, user));
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "PDF_PRONTUARIO_GERADO",
    entity: "Patient",
    entityId: id,
    patientId: id,
    details: { atendimentos: encounters.length },
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName("prontuario", patient.name, new Date())}"`,
      "Cache-Control": "no-store",
    },
  });
}
