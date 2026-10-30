import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canViewClinical } from "@/lib/permissions";
import { pdfFileName } from "@/lib/pdf-content";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canViewClinical(user)) return new NextResponse("Sem permissão", { status: 403 });

  const { id } = await params;
  const signed = await prisma.signedPdf.findFirst({ where: { id, clinicId: user.clinicId }, include: { patient: true } });
  if (!signed) return new NextResponse("Documento não encontrado", { status: 404 });

  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "PDF_ASSINADO_BAIXADO",
    entity: "SignedPdf",
    entityId: signed.id,
    patientId: signed.patientId,
  });
  return new NextResponse(Buffer.from(signed.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName("assinado", signed.patient.name, signed.signedAt)}"`,
      "Cache-Control": "no-store",
    },
  });
}
