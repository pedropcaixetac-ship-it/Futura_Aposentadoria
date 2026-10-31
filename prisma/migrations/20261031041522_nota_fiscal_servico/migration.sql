-- CreateEnum
CREATE TYPE "InvoiceIssuer" AS ENUM ('CLINICA', 'PROFISSIONAL');

-- CreateEnum
CREATE TYPE "ServiceInvoiceStatus" AS ENUM ('PEDIDA', 'EMITIDA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Charge" ADD COLUMN     "healthReceiptAt" DATE;

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "cityIbgeCode" TEXT,
ADD COLUMN     "invoiceIssuer" "InvoiceIssuer" NOT NULL DEFAULT 'PROFISSIONAL',
ADD COLUMN     "issRateBasisPoints" INTEGER,
ADD COLUMN     "municipalRegistration" TEXT,
ADD COLUMN     "serviceCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "municipalRegistration" TEXT;

-- CreateTable
CREATE TABLE "ServiceInvoice" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "issuer" "InvoiceIssuer" NOT NULL,
    "status" "ServiceInvoiceStatus" NOT NULL DEFAULT 'PEDIDA',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" TEXT NOT NULL,
    "number" TEXT,
    "verificationCode" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerRef" TEXT,
    "notes" TEXT,

    CONSTRAINT "ServiceInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceInvoice_chargeId_key" ON "ServiceInvoice"("chargeId");

-- CreateIndex
CREATE INDEX "ServiceInvoice_clinicId_status_idx" ON "ServiceInvoice"("clinicId", "status");

-- AddForeignKey
ALTER TABLE "ServiceInvoice" ADD CONSTRAINT "ServiceInvoice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceInvoice" ADD CONSTRAINT "ServiceInvoice_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Trava de mesma clínica (ver migração mesma_clinica).
CREATE TRIGGER "serviceinvoice_mesma_clinica"
BEFORE INSERT OR UPDATE ON "ServiceInvoice"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('chargeId', 'Charge', 'requestedById', 'User', 'issuedById', 'User');
