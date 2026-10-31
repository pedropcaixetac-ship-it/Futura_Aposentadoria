-- Laudos do SUS: APAC, AIH e LME.
ALTER TYPE "DocumentType" ADD VALUE 'APAC';
ALTER TYPE "DocumentType" ADD VALUE 'AIH';
ALTER TYPE "DocumentType" ADD VALUE 'LME';

-- O laudo pode ser emitido pela ficha do paciente, sem atendimento.
ALTER TABLE "ClinicalDocument" ALTER COLUMN "encounterId" DROP NOT NULL;
ALTER TABLE "ClinicalDocument" ADD COLUMN "fields" JSONB;

CREATE INDEX "ClinicalDocument_patientId_idx" ON "ClinicalDocument"("patientId");
