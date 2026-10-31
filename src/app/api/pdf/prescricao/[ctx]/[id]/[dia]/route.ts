import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canWorkClinical } from "@/lib/permissions";
import { buildPdf, type PdfSection } from "@/lib/pdf";
import { patientLines, pdfFileName } from "@/lib/pdf-content";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatTime } from "@/lib/agenda";
import { displayName } from "@/lib/staff";
import { dayFromKey, dayWindow, doseTimes, frequencyLabel, inDay, kindLabel } from "@/lib/prescricao";

const staff = { select: { name: true, sex: true, jobTitle: true } } as const;

// PDF da prescrição de um dia, com a checagem de cada horário (como fica na pasta do paciente).
export async function GET(_request: Request, { params }: { params: Promise<{ ctx: string; id: string; dia: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canWorkClinical(user)) return new NextResponse("Sem permissão", { status: 403 });
  const { ctx, id, dia } = await params;
  const midnight = dayFromKey(dia);
  if (!midnight || (ctx !== "internacao" && ctx !== "ps")) return new NextResponse("Endereço inválido", { status: 400 });

  const place = ctx === "internacao"
    ? await prisma.admission.findFirst({ where: { id, clinicId: user.clinicId }, include: { patient: true, bed: { include: { ward: true } } } })
    : await prisma.emergencyVisit.findFirst({ where: { id, clinicId: user.clinicId }, include: { patient: true } });
  if (!place) return new NextResponse("Não encontrado", { status: 404 });

  const items = (
    await prisma.prescriptionItem.findMany({
      where: { clinicId: user.clinicId, ...(ctx === "internacao" ? { admissionId: id } : { emergencyVisitId: id }) },
      include: { prescriber: staff, suspendedBy: staff, checks: { include: { recordedBy: staff }, orderBy: { at: "asc" } } },
      orderBy: { createdAt: "asc" },
    })
  ).filter((i) => inDay(i, midnight));

  const sections: PdfSection[] = items.length
    ? items.map((i, n) => {
        const [from, to] = dayWindow(i, midnight);
        const valid = i.checks.filter((c) => !c.canceledAt);
        const times = doseTimes(i, from, to).map((t) => {
          const c = valid.find((x) => x.scheduledAt?.getTime() === t.getTime());
          return `${formatTime(t)} ${c ? `${c.status === "FEITO" ? "feito" : "NÃO feito"} (${displayName(c.recordedBy)} ${formatTime(c.at)}${c.note ? `, ${c.note}` : ""})` : "—"}`;
        });
        const asNeeded = valid.filter((c) => !c.scheduledAt && c.at >= from && c.at < to).map((c) => `${formatTime(c.at)} ${c.status === "FEITO" ? "feito" : "NÃO feito"} (${displayName(c.recordedBy)}${c.note ? `, ${c.note}` : ""})`);
        return {
          title: `${n + 1}. ${[i.description, i.dose, i.route, frequencyLabel(i)].filter(Boolean).join(" · ")}`,
          text: [
            `${kindLabel[i.kind]} · ${displayName(i.prescriber)} · início ${formatDateTime(i.startAt)}${i.endAt ? ` · vale até ${formatDateTime(i.endAt)}` : ""}`,
            i.note && `Obs.: ${i.note}`,
            i.suspendedAt && `SUSPENSO em ${formatDateTime(i.suspendedAt)}${i.suspendedBy ? ` por ${displayName(i.suspendedBy)}` : ""}: ${i.suspendReason ?? ""}`,
            times.length > 0 && `Horários: ${times.join(" | ")}`,
            asNeeded.length > 0 && `Doses se necessário: ${asNeeded.join(" | ")}`,
          ].filter(Boolean).join("\n"),
        };
      })
    : [{ text: "Nada prescrito neste dia." }];

  const where = "bed" in place ? `Internação · ${place.bed.ward.name} · leito ${place.bed.code}` : "Pronto-socorro";
  const prescribers = [...new Set(items.map((i) => displayName(i.prescriber)))];
  const pdf = await buildPdf({
    clinicName: user.clinic.name,
    title: `Prescrição de ${formatDate(midnight)}`,
    info: [...patientLines(place.patient), where, ...(prescribers.length ? [`Prescrito por: ${prescribers.join(", ")}`] : [])],
    sections,
    place: `Gerado em ${formatDateTime(new Date())} por ${displayName(user)}`,
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PDF_PRESCRICAO", entity: ctx === "internacao" ? "Admission" : "EmergencyVisit", entityId: id, patientId: place.patientId, details: { dia } });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName("prescricao", place.patient.name, midnight)}"`,
      "Cache-Control": "no-store",
    },
  });
}
