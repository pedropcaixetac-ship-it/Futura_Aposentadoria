-- AlterTable
ALTER TABLE "RecordTemplate" ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "RecordTemplate_clinicId_ownerId_idx" ON "RecordTemplate"("clinicId", "ownerId");

-- AddForeignKey
ALTER TABLE "RecordTemplate" ADD CONSTRAINT "RecordTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
