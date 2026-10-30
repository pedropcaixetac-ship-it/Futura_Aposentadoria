import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canViewClinical } from "@/lib/permissions";
import { documentTypeLabel } from "@/lib/documents";
import { buildPdf } from "@/lib/pdf";
import { documentPdfInput, pdfFileName } from "@/lib/pdf-content";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canViewClinical(user)) return new NextResponse("Sem permissão", { status: 403 });

  const { id } = await params;
  const doc = await prisma.clinicalDocument.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { patient: true, author: true },
  });
  if (!doc) return new NextResponse("Documento não encontrado", { status: 404 });

  const bytes = await buildPdf(documentPdfInput(user.clinic.name, doc));
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "PDF_DOCUMENTO_GERADO",
    entity: "ClinicalDocument",
    entityId: doc.id,
    patientId: doc.patientId,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName(documentTypeLabel[doc.type], doc.patient.name, doc.createdAt)}"`,
      "Cache-Control": "no-store",
    },
  });
}
