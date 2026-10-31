-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "lastDpsNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastDpsNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ServiceInvoice" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "providerMessage" TEXT,
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "url" TEXT;
