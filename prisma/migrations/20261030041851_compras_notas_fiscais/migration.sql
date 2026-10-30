-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('ATIVA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "installment" INTEGER,
ADD COLUMN     "purchaseId" TEXT;

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierCnpj" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceSeries" TEXT,
    "accessKey" TEXT,
    "issueDate" DATE NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'ATIVA',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "batch" TEXT,
    "expiresAt" DATE,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Purchase_clinicId_issueDate_idx" ON "Purchase"("clinicId", "issueDate");

-- CreateIndex
CREATE INDEX "Purchase_clinicId_supplierCnpj_invoiceNumber_idx" ON "Purchase"("clinicId", "supplierCnpj", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Expense_purchaseId_idx" ON "Expense"("purchaseId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
