-- Hospital: farmácia (produtos, estoque por lote e validade, dispensação do prescrito).

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('ENTRADA', 'DISPENSACAO', 'DEVOLUCAO', 'AJUSTE', 'PERDA');



-- CreateTable
CREATE TABLE "PharmacyProduct" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "presentation" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unidade',
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "controlled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lot" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "invoice" TEXT,
    "patientId" TEXT,
    "prescriptionItemId" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyProduct_clinicId_name_presentation_key" ON "PharmacyProduct"("clinicId", "name", "presentation");

-- CreateIndex
CREATE INDEX "StockMovement_clinicId_productId_idx" ON "StockMovement"("clinicId", "productId");

-- CreateIndex
CREATE INDEX "StockMovement_prescriptionItemId_idx" ON "StockMovement"("prescriptionItemId");

-- AddForeignKey
ALTER TABLE "PharmacyProduct" ADD CONSTRAINT "PharmacyProduct_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_prescriptionItemId_fkey" FOREIGN KEY ("prescriptionItemId") REFERENCES "PrescriptionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Entrada e devolução somam; dispensação e perda tiram; ajuste pode ir para os dois lados.
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sinal" CHECK (
  "quantity" <> 0
  AND ("kind" NOT IN ('ENTRADA', 'DEVOLUCAO') OR "quantity" > 0)
  AND ("kind" NOT IN ('DISPENSACAO', 'PERDA') OR "quantity" < 0)
);

-- Trava de mesma clínica (ver 20261030200000_mesma_clinica).
CREATE TRIGGER "stockmovement_mesma_clinica"
BEFORE INSERT OR UPDATE ON "StockMovement"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica(
  'productId', 'PharmacyProduct', 'patientId', 'Patient', 'prescriptionItemId', 'PrescriptionItem', 'userId', 'User');

-- Movimentação de estoque não muda nem some: erro se corrige com um ajuste.
CREATE OR REPLACE FUNCTION bloquear_alteracao_total()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registros de % não podem ser alterados nem excluídos; faça um ajuste', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stockmovement_imutavel
BEFORE UPDATE OR DELETE ON "StockMovement"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_total();
