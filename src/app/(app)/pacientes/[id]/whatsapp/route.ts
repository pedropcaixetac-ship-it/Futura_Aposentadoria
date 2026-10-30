import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isWhatsappTemplate, whatsappLink } from "@/lib/whatsapp";

// Passa por aqui antes de abrir o WhatsApp, para conferir o consentimento
// do paciente e registrar na auditoria quem mandou mensagem e quando.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("pacientes");
  const { id } = await params;
  const modelo = new URL(request.url).searchParams.get("modelo") ?? "livre";
  const patient = await prisma.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!patient || !isWhatsappTemplate(modelo)) return new NextResponse("Não encontrado.", { status: 404 });
  if (!patient.whatsappOptIn) {
    return new NextResponse("O paciente não autorizou receber mensagens pelo WhatsApp.", { status: 403 });
  }

  const link = patient.phoneWhatsapp && whatsappLink(patient.phone ?? "", modelo, {
    patient: patient.socialName || patient.name,
    clinic: user.clinic.name,
  });
  if (!link) return new NextResponse("O celular do paciente não tem WhatsApp ou é inválido.", { status: 400 });

  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "WHATSAPP_ABERTO",
    entity: "Patient",
    entityId: id,
    patientId: id,
    details: { modelo },
  });
  return NextResponse.redirect(link);
}
