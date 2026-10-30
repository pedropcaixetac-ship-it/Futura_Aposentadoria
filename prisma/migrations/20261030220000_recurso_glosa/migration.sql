-- CreateTable
CREATE TABLE "ClaimAppeal" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sentAt" DATE NOT NULL,
    "protocol" TEXT,
    "resolvedAt" DATE,
    "recoveredCents" INTEGER,
    "chargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimAppeal_claimId_key" ON "ClaimAppeal"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimAppeal_chargeId_key" ON "ClaimAppeal"("chargeId");

-- AddForeignKey
ALTER TABLE "ClaimAppeal" ADD CONSTRAINT "ClaimAppeal_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimAppeal" ADD CONSTRAINT "ClaimAppeal_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "InsuranceClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimAppeal" ADD CONSTRAINT "ClaimAppeal_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Trava de mesma clínica (ver 20261030200000_mesma_clinica) para o recurso de glosa.
CREATE TRIGGER "claimappeal_mesma_clinica"
BEFORE INSERT OR UPDATE ON "ClaimAppeal"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('claimId', 'InsuranceClaim', 'chargeId', 'Charge');
