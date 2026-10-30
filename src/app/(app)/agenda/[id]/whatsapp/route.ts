import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canManageAgendaOf } from "@/lib/permissions";
import { appointmentTypeLabel, clinicParts, formatTime, weekdayName } from "@/lib/agenda";
import { displayName } from "@/lib/staff";
import { canMessage, fillMessage, whatsappUrl } from "@/lib/whatsapp";
import { loadMessages } from "@/lib/whatsapp-data";
import { teleconsultationPath, teleconsultationState } from "@/lib/teleconsulta";
import { siteOrigin } from "@/lib/teleconsulta-sala";

// Abre o WhatsApp com a confirmação da consulta (?modelo=confirmacao) ou o aviso
// de retorno (?modelo=retorno), anota na consulta que a mensagem foi enviada e
// registra na auditoria.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("agenda");
  const { id } = await params;
  const modelo = new URL(request.url).searchParams.get("modelo");
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { patient: true, professional: true, teleconsultation: true },
  });
  if (!appointment || !canManageAgendaOf(user, appointment.professionalId) || (modelo !== "confirmacao" && modelo !== "retorno")) {
    return new NextResponse("Não encontrado.", { status: 404 });
  }
  const { patient } = appointment;
  if (!canMessage(patient)) {
    return new NextResponse("O paciente não autorizou mensagens pelo WhatsApp ou o celular não tem WhatsApp.", { status: 403 });
  }

  const messages = await loadMessages(user.clinicId);
  const { date, weekday } = clinicParts(appointment.startsAt);
  const [, month, day] = date.split("-");
  const text = fillMessage(messages[modelo], {
    paciente: patient.socialName || patient.name,
    clinica: user.clinic.name,
    profissional: displayName(appointment.professional),
    tipo: appointmentTypeLabel[appointment.type].toLowerCase(),
    dia: `${day}/${month} (${weekdayName(weekday).toLowerCase()})`,
    hora: formatTime(appointment.startsAt),
  });
  // Teleconsulta: a confirmação já leva o link da chamada.
  const tele = appointment.teleconsultation;
  const withVideo =
    modelo === "confirmacao" && tele && ["AGUARDANDO_TERMO", "LIBERADA"].includes(teleconsultationState(tele))
      ? `${text}\n\nSua consulta será por vídeo. No dia e horário marcados, entre por este link (não precisa instalar nada): ${await siteOrigin()}${teleconsultationPath(tele.token)}`
      : text;
  const link = whatsappUrl(patient.phone, withVideo);
  if (!link) return new NextResponse("Celular inválido.", { status: 400 });

  await prisma.appointment.update({
    where: { id },
    data: modelo === "confirmacao" ? { confirmationSentAt: new Date() } : { returnNoticeSentAt: new Date() },
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "WHATSAPP_ABERTO",
    entity: "Appointment",
    entityId: id,
    patientId: patient.id,
    details: { modelo },
  });
  return NextResponse.redirect(link);
}
