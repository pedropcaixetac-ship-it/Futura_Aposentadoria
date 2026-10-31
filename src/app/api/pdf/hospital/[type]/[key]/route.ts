import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canWorkClinical } from "@/lib/permissions";
import { buildPdf } from "@/lib/pdf";
import { pdfFileName } from "@/lib/pdf-content";
import { isRecordType, loadHospitalRecordForViewer, recordAuthorId } from "@/lib/signature/hospital";

// PDF de um registro do hospital (triagem, alta, cirurgia, exame, quimio, parecer, prescrição, enfermagem).
// Se a versão atual já foi assinada, entrega o PDF assinado.
export async function GET(_request: Request, { params }: { params: Promise<{ type: string; key: string }> }) {
  const user = await getCurrentUser();
  const { type, key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  if (!user || !isRecordType(type)) return new NextResponse("Sem permissão", { status: 403 });
  // Equipe assistencial, ou o próprio autor.
  if (!canWorkClinical(user) && (await recordAuthorId(user.clinicId, type, key)) !== user.id) return new NextResponse("Sem permissão", { status: 403 });

  const record = await loadHospitalRecordForViewer(user.clinicId, type, key);
  if (!record) return new NextResponse("Registro não encontrado", { status: 404 });
  const signed = await prisma.signedPdf.findFirst({
    where: { clinicId: user.clinicId, recordType: type, recordKey: key, recordHash: record.hash },
    select: { pdf: true },
    orderBy: { signedAt: "desc" },
  });
  const pdf = signed ? Buffer.from(signed.pdf) : Buffer.from(await buildPdf(record.input));
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PDF_HOSPITAL", entity: type, entityId: key, patientId: record.patientId });
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName(type, record.patientName, record.when)}"`,
      "Cache-Control": "no-store",
    },
  });
}
