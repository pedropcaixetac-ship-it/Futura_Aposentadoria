-- CreateEnum
CREATE TYPE "ClaimKind" AS ENUM ('CONSULTA', 'SPSADT');

-- AlterTable
ALTER TABLE "ClaimBatch" ADD COLUMN     "kind" "ClaimKind" NOT NULL DEFAULT 'CONSULTA';

-- AlterTable
ALTER TABLE "InsuranceClaim" ADD COLUMN     "authorizationCode" TEXT,
ADD COLUMN     "authorizationDate" DATE,
ADD COLUMN     "clinicalIndication" TEXT,
ADD COLUMN     "kind" "ClaimKind" NOT NULL DEFAULT 'CONSULTA',
ADD COLUMN     "requestDate" DATE,
ADD COLUMN     "serviceType" TEXT,
ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "consultationType" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ClaimItem" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "tussCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,

    CONSTRAINT "ClaimItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimItem_claimId_sequence_key" ON "ClaimItem"("claimId", "sequence");

-- AddForeignKey
ALTER TABLE "ClaimItem" ADD CONSTRAINT "ClaimItem_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimItem" ADD CONSTRAINT "ClaimItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "InsuranceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Trava de mesma clínica (ver 20261030200000_mesma_clinica) para os itens da guia SP/SADT.
CREATE TRIGGER "claimitem_mesma_clinica"
BEFORE INSERT OR UPDATE ON "ClaimItem"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('claimId', 'InsuranceClaim');
