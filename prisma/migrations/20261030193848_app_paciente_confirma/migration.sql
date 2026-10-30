-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "cancelledInAppAt" TIMESTAMP(3),
ADD COLUMN     "confirmedInAppAt" TIMESTAMP(3);
