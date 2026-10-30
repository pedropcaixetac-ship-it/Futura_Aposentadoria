-- AlterEnum
ALTER TYPE "AppointmentType" ADD VALUE 'TELECONSULTA';

-- DropForeignKey
ALTER TABLE "Teleconsultation" DROP CONSTRAINT "Teleconsultation_encounterId_fkey";

-- AlterTable
ALTER TABLE "Teleconsultation" ADD COLUMN     "appointmentId" TEXT,
ALTER COLUMN "encounterId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Teleconsultation_appointmentId_key" ON "Teleconsultation"("appointmentId");

-- AddForeignKey
ALTER TABLE "Teleconsultation" ADD CONSTRAINT "Teleconsultation_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teleconsultation" ADD CONSTRAINT "Teleconsultation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

