-- Assinatura ICP dos registros do hospital: prescrição do dia, enfermagem, triagem, alta, cirurgia, exame, quimio, parecer.
ALTER TABLE "SignedPdf" ADD COLUMN     "recordHash" TEXT,
ADD COLUMN     "recordKey" TEXT,
ADD COLUMN     "recordType" TEXT;

CREATE INDEX "SignedPdf_clinicId_recordType_recordKey_idx" ON "SignedPdf"("clinicId", "recordType", "recordKey");

CREATE INDEX "SignedPdf_signerId_signedAt_idx" ON "SignedPdf"("signerId", "signedAt");
