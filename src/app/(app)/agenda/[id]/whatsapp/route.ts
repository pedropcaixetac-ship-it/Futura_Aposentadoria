import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canManageAgendaOf } from "@/lib/permissions";
import { appointmentTypeLabel, clinicParts, formatTime, weekdayName } from "@/lib/agenda";
import { displayName } from "@/lib/staff";
import { canMessage, fillMessage, whatsappUrl } from "@/lib/whatsapp";
import { loadMessages } from "@/lib/whatsapp-data";

// Abre o WhatsApp com a confirmação da consulta (?modelo=confirmacao) ou o aviso
// de retorno (?modelo=retorno), anota na consulta que a mensagem foi enviada e
// registra na auditoria.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("agenda");
  const { id } = await params;
  const modelo = new URL(request.url).searchParams.get("modelo");
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { patient: true, professional: true },
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
  const link = whatsappUrl(patient.phone, text);
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
