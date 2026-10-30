import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canWorkClinical } from "@/lib/permissions";
import { hasTab } from "@/lib/tabs";
import { buildPdf } from "@/lib/pdf";
import { pdfFileName, prontuarioPdfInput } from "@/lib/pdf-content";
import { loadProntuario } from "@/lib/prontuario";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasTab(user, "pacientes") || !canWorkClinical(user)) return new NextResponse("Sem permissão", { status: 403 });

  const { id } = await params;
  const prontuario = await loadProntuario(user, id);
  if (!prontuario) return new NextResponse("Paciente não encontrado", { status: 404 });

  const bytes = await buildPdf(prontuarioPdfInput(user.clinic.name, prontuario, user));
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "PDF_PRONTUARIO_GERADO",
    entity: "Patient",
    entityId: id,
    patientId: id,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName("prontuario", prontuario.patient.name, new Date())}"`,
      "Cache-Control": "no-store",
    },
  });
}
