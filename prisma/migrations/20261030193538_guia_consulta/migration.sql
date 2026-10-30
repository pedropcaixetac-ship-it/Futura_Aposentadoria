-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('ABERTA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "lastClaimNumber" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "healthPlanId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "encounterId" TEXT,
    "number" INTEGER NOT NULL,
    "operatorNumber" TEXT,
    "cardNumber" TEXT NOT NULL,
    "cardValidUntil" DATE,
    "newborn" BOOLEAN NOT NULL DEFAULT false,
    "serviceDate" DATE NOT NULL,
    "consultationType" INTEGER NOT NULL,
    "accidentIndication" INTEGER NOT NULL DEFAULT 9,
    "cbo" TEXT NOT NULL,
    "tussCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'ABERTA',
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsuranceClaim_clinicId_serviceDate_idx" ON "InsuranceClaim"("clinicId", "serviceDate");

-- CreateIndex
CREATE INDEX "InsuranceClaim_encounterId_idx" ON "InsuranceClaim"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_clinicId_number_key" ON "InsuranceClaim"("clinicId", "number");

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_healthPlanId_fkey" FOREIGN KEY ("healthPlanId") REFERENCES "HealthPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
