-- Paciente pode marcar consulta pelo aplicativo: aí não há funcionário que marcou.
-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_createdById_fkey";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "createdInAppAt" TIMESTAMP(3),
ADD COLUMN     "rescheduledInAppAt" TIMESTAMP(3),
ALTER COLUMN "createdById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
