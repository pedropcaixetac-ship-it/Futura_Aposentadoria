import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { displayName } from "@/lib/staff";
import { canMessage, fillMessage, whatsappUrl } from "@/lib/whatsapp";
import { loadMessages } from "@/lib/whatsapp-data";

// Passa por aqui antes de abrir o WhatsApp, para conferir o consentimento
// do paciente e registrar na auditoria quem mandou mensagem e quando.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("pacientes");
  const { id } = await params;
  const modelo = new URL(request.url).searchParams.get("modelo") ?? "livre";
  const patient = await prisma.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!patient || !["livre", "contato", "retorno"].includes(modelo)) return new NextResponse("Não encontrado.", { status: 404 });
  if (!canMessage(patient)) {
    return new NextResponse("O paciente não autorizou mensagens pelo WhatsApp ou o celular não tem WhatsApp.", { status: 403 });
  }

  let text = "";
  if (modelo !== "livre") {
    // No aviso de retorno, o profissional é o da última consulta do paciente.
    const last =
      modelo === "retorno"
        ? await prisma.appointment.findFirst({
            where: { clinicId: user.clinicId, patientId: id, status: { not: "DESMARCADO" }, startsAt: { lte: new Date() } },
            orderBy: { startsAt: "desc" },
            select: { professional: { select: { name: true, jobTitle: true, sex: true } } },
          })
        : null;
    const messages = await loadMessages(user.clinicId);
    text = fillMessage(messages[modelo as "contato" | "retorno"], {
      paciente: patient.socialName || patient.name,
      clinica: user.clinic.name,
      profissional: last ? displayName(last.professional) : "nossa equipe",
    });
  }
  const link = whatsappUrl(patient.phone, text);
  if (!link) return new NextResponse("Celular inválido.", { status: 400 });

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
