-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "confirmationSentAt" TIMESTAMP(3),
ADD COLUMN     "returnDueOn" DATE,
ADD COLUMN     "returnNoticeSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Appointment_clinicId_returnDueOn_idx" ON "Appointment"("clinicId", "returnDueOn");
