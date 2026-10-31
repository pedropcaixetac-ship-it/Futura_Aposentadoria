import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { hasTab } from "@/lib/tabs";
import { availableProviders } from "@/lib/signature/providers";
import { loadHospitalRecord, type RecordType } from "@/lib/signature/hospital";
import { hospitalTarget } from "@/lib/signature/service";
import { SignBox } from "../pacientes/[id]/atendimentos/[encounterId]/sign-box";

// Botões de um registro do hospital: "PDF" para todos e, para o autor, "Assinar" ou o selo de assinado.
export async function RecordActions({ user, type, recordKey, back, signLabel = "Assinar" }: { user: CurrentUser; type: RecordType; recordKey: string; back?: string; signLabel?: string }) {
  const mine = await loadHospitalRecord(user, type, recordKey);
  const signed = mine
    ? await prisma.signedPdf.findFirst({
        where: { clinicId: user.clinicId, recordType: type, recordKey: mine.key, recordHash: mine.hash },
        select: { id: true, signerName: true, signedAt: true, provider: true },
        orderBy: { signedAt: "desc" },
      })
    : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/pdf/hospital/${type}/${encodeURIComponent(recordKey)}`} target="_blank" className="btn-secondary px-3! py-1.5! text-sm">PDF</a>
      {mine && hasTab(user, "assinatura") && (
        <SignBox target={hospitalTarget(type, mine.key)} signed={signed} canSign providers={availableProviders()} back={back} label={signLabel} />
      )}
    </div>
  );
}
