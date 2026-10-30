-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "lastBatchNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InsuranceClaim" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "careRegime" TEXT NOT NULL DEFAULT '01';

-- CreateTable
CREATE TABLE "ClaimBatch" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "healthPlanId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "tissVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimBatch_clinicId_number_key" ON "ClaimBatch"("clinicId", "number");

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ClaimBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimBatch" ADD CONSTRAINT "ClaimBatch_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimBatch" ADD CONSTRAINT "ClaimBatch_healthPlanId_fkey" FOREIGN KEY ("healthPlanId") REFERENCES "HealthPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Trava de mesma clínica (ver 20261030200000_mesma_clinica) para as guias e os lotes.
CREATE TRIGGER "insuranceclaim_mesma_clinica"
BEFORE INSERT OR UPDATE ON "InsuranceClaim"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('healthPlanId', 'HealthPlan', 'patientId', 'Patient', 'professionalId', 'User', 'encounterId', 'Encounter', 'batchId', 'ClaimBatch');

CREATE TRIGGER "claimbatch_mesma_clinica"
BEFORE INSERT OR UPDATE ON "ClaimBatch"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('healthPlanId', 'HealthPlan');
