import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canViewClinical } from "@/lib/permissions";
import { hasTab } from "@/lib/tabs";
import { buildPdf } from "@/lib/pdf";
import { pdfFileName, recordPdfInput } from "@/lib/pdf-content";
import { loadRecordForPdf } from "@/lib/prontuario";

// PDF do prontuário inteiro do paciente. Só quem tem acesso completo ao prontuário,
// e só atendimentos finalizados (rascunhos ainda podem mudar).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasTab(user, "pacientes") || !canViewClinical(user)) return new NextResponse("Sem permissão", { status: 403 });

  const { id } = await params;
  const record = await loadRecordForPdf(user.clinicId, id);
  if (!record) return new NextResponse("Paciente não encontrado", { status: 404 });
  const { patient, encounters } = record;

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
