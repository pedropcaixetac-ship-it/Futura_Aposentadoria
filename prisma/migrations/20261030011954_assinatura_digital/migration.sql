-- CreateTable
CREATE TABLE "SignatureSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "certificateAlias" TEXT NOT NULL,
    "certificateChain" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignedPdf" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "documentId" TEXT,
    "signerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerCpf" TEXT,
    "certificateSerial" TEXT NOT NULL,
    "pdf" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignedPdf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignatureSession_userId_provider_key" ON "SignatureSession"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "SignedPdf_encounterId_key" ON "SignedPdf"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "SignedPdf_documentId_key" ON "SignedPdf"("documentId");

-- AddForeignKey
ALTER TABLE "SignatureSession" ADD CONSTRAINT "SignatureSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedPdf" ADD CONSTRAINT "SignedPdf_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedPdf" ADD CONSTRAINT "SignedPdf_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedPdf" ADD CONSTRAINT "SignedPdf_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedPdf" ADD CONSTRAINT "SignedPdf_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ClinicalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedPdf" ADD CONSTRAINT "SignedPdf_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PDF assinado não pode ser alterado nem excluído.
CREATE TRIGGER signedpdf_imutavel
BEFORE UPDATE OR DELETE ON "SignedPdf"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_registro();
