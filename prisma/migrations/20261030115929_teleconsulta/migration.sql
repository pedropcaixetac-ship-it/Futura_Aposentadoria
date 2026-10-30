-- CreateTable
CREATE TABLE "Teleconsultation" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "roomName" TEXT,
    "roomUrl" TEXT,
    "consentText" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentIp" TEXT,
    "consentDevice" TEXT,
    "professionalJoinedAt" TIMESTAMP(3),
    "patientJoinedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Teleconsultation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Teleconsultation_encounterId_key" ON "Teleconsultation"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "Teleconsultation_token_key" ON "Teleconsultation"("token");

-- CreateIndex
CREATE INDEX "Teleconsultation_clinicId_patientId_idx" ON "Teleconsultation"("clinicId", "patientId");

-- AddForeignKey
ALTER TABLE "Teleconsultation" ADD CONSTRAINT "Teleconsultation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teleconsultation" ADD CONSTRAINT "Teleconsultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teleconsultation" ADD CONSTRAINT "Teleconsultation_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teleconsultation" ADD CONSTRAINT "Teleconsultation_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A teleconsulta faz parte do prontuário: não pode ser excluída, e o termo
-- de consentimento, depois de aceito, não pode ser trocado nem apagado.
CREATE OR REPLACE FUNCTION proteger_teleconsulta()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Teleconsultas não podem ser excluídas';
  END IF;
  IF OLD."consentAt" IS NOT NULL AND (
    NEW."consentAt" IS DISTINCT FROM OLD."consentAt" OR
    NEW."consentText" IS DISTINCT FROM OLD."consentText" OR
    NEW."consentIp" IS DISTINCT FROM OLD."consentIp" OR
    NEW."consentDevice" IS DISTINCT FROM OLD."consentDevice"
  ) THEN
    RAISE EXCEPTION 'O termo de consentimento aceito não pode ser alterado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER teleconsulta_protegida
BEFORE UPDATE OR DELETE ON "Teleconsultation"
FOR EACH ROW EXECUTE FUNCTION proteger_teleconsulta();
