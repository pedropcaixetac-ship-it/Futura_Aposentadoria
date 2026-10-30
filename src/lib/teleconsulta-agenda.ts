import { prisma } from "./db";
import { audit } from "./audit";
import { newTeleconsultationToken, scheduledLinkExpiry } from "./teleconsulta";
import { deleteRoom } from "./video";

// Mantém a teleconsulta de um agendamento em dia com a agenda:
// - marcada como "Teleconsulta": cria o link (ou acompanha a remarcação);
// - desmarcada ou trocada para outro tipo: o link deixa de funcionar.
// userId vazio quando quem mexeu foi o próprio paciente, pelo aplicativo.
export async function syncAppointmentTeleconsultation(appointmentId: string, userId: string | null) {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { teleconsultation: true },
  });
  const tele = appointment.teleconsultation;
  const wanted = appointment.type === "TELECONSULTA" && appointment.status !== "DESMARCADO";

  if (wanted && !tele) {
    const created = await prisma.teleconsultation.create({
      data: {
        clinicId: appointment.clinicId,
        patientId: appointment.patientId,
        professionalId: appointment.professionalId,
        appointmentId: appointment.id,
        encounterId: appointment.encounterId,
        token: newTeleconsultationToken(),
        expiresAt: scheduledLinkExpiry(appointment.endsAt),
      },
    });
    await audit({
      clinicId: appointment.clinicId,
      userId,
      action: "TELECONSULTA_CRIADA",
      entity: "Teleconsultation",
      entityId: created.id,
      patientId: appointment.patientId,
    });
  } else if (wanted && tele && !tele.endedAt) {
    await prisma.teleconsultation.update({
      where: { id: tele.id },
      data: { professionalId: appointment.professionalId, expiresAt: scheduledLinkExpiry(appointment.endsAt) },
    });
  } else if (!wanted && tele && !tele.endedAt) {
    await prisma.teleconsultation.update({ where: { id: tele.id }, data: { endedAt: new Date() } });
    if (tele.roomName) await deleteRoom(tele.roomName).catch((e) => console.error(e));
    await audit({
      clinicId: appointment.clinicId,
      userId,
      action: "TELECONSULTA_ENCERRADA",
      entity: "Teleconsultation",
      entityId: tele.id,
      patientId: appointment.patientId,
      details: { motivo: appointment.status === "DESMARCADO" ? "consulta desmarcada" : "tipo da consulta alterado" },
    });
  }
}
