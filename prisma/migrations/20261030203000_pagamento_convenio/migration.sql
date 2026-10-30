-- AlterTable
ALTER TABLE "ClaimBatch" ADD COLUMN     "paidAt" DATE,
ADD COLUMN     "protocol" TEXT;

-- AlterTable
ALTER TABLE "InsuranceClaim" ADD COLUMN     "chargeId" TEXT,
ADD COLUMN     "glossReason" TEXT,
ADD COLUMN     "paidCents" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_chargeId_key" ON "InsuranceClaim"("chargeId");

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Trava de mesma clínica (ver 20261030200000_mesma_clinica) para a receita lançada pela guia.
CREATE TRIGGER "insuranceclaim_receita_mesma_clinica"
BEFORE INSERT OR UPDATE ON "InsuranceClaim"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('chargeId', 'Charge');
