-- Mensalidades que as clínicas pagaram à empresa (Painel do dono → Financeiro).
-- CreateTable
CREATE TABLE "ClinicPayment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "notes" TEXT,
    "previousPaidUntil" DATE,
    "paidUntil" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "ClinicPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicPayment_clinicId_createdAt_idx" ON "ClinicPayment"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicPayment_paidAt_idx" ON "ClinicPayment"("paidAt");

-- AddForeignKey
ALTER TABLE "ClinicPayment" ADD CONSTRAINT "ClinicPayment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicPayment" ADD CONSTRAINT "ClinicPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicPayment" ADD CONSTRAINT "ClinicPayment_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

