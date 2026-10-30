import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canManageAgendaOf } from "@/lib/permissions";
import { appointmentTypeLabel, clinicParts, formatTime, weekdayName } from "@/lib/agenda";
import { canMessage, confirmationLink, returnLink } from "@/lib/whatsapp";
import { displayName } from "@/lib/staff";

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

  const vars = { patient: patient.socialName || patient.name, clinic: user.clinic.name, professional: displayName(appointment.professional) };
  let link: string | null;
  if (modelo === "confirmacao") {
    const { date, weekday } = clinicParts(appointment.startsAt);
    const [, month, day] = date.split("-");
    link = confirmationLink(patient.phone ?? "", {
      ...vars,
      type: appointmentTypeLabel[appointment.type].toLowerCase(),
      day: `${day}/${month} (${weekdayName(weekday).toLowerCase()})`,
      time: formatTime(appointment.startsAt),
    });
  } else {
    link = returnLink(patient.phone ?? "", vars);
  }
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
