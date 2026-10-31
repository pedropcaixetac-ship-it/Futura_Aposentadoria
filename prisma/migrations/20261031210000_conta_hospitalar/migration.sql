-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('ABERTA', 'FECHADA');

-- CreateEnum
CREATE TYPE "BillItemKind" AS ENUM ('DIARIA', 'MEDICAMENTO', 'EXAME', 'CIRURGIA', 'TAXA', 'OUTRO');

-- CreateTable
CREATE TABLE "HospitalPrice" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalBill" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'ABERTA',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "chargeId" TEXT,

    CONSTRAINT "HospitalBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalBillItem" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "kind" "BillItemKind" NOT NULL,
    "source" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" TEXT,

    CONSTRAINT "HospitalBillItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HospitalPrice_clinicId_key_key" ON "HospitalPrice"("clinicId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalBill_admissionId_key" ON "HospitalBill"("admissionId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalBill_chargeId_key" ON "HospitalBill"("chargeId");

-- CreateIndex
CREATE INDEX "HospitalBill_clinicId_status_idx" ON "HospitalBill"("clinicId", "status");

-- CreateIndex
CREATE INDEX "HospitalBillItem_billId_idx" ON "HospitalBillItem"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalBillItem_billId_source_key" ON "HospitalBillItem"("billId", "source");

-- AddForeignKey
ALTER TABLE "HospitalPrice" ADD CONSTRAINT "HospitalPrice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBill" ADD CONSTRAINT "HospitalBill_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBill" ADD CONSTRAINT "HospitalBill_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBill" ADD CONSTRAINT "HospitalBill_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBill" ADD CONSTRAINT "HospitalBill_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBillItem" ADD CONSTRAINT "HospitalBillItem_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBillItem" ADD CONSTRAINT "HospitalBillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "HospitalBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBillItem" ADD CONSTRAINT "HospitalBillItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Valores coerentes: quantidade positiva, preço não negativo, total = quantidade x preço.
ALTER TABLE "HospitalPrice" ADD CONSTRAINT "HospitalPrice_valor" CHECK ("priceCents" >= 0);
ALTER TABLE "HospitalBillItem" ADD CONSTRAINT "HospitalBillItem_valores" CHECK ("quantity" > 0 AND "unitCents" >= 0 AND "totalCents" = "quantity" * "unitCents");

-- Trava de mesma clínica (ver 20261030200000_mesma_clinica).
CREATE TRIGGER "hospitalbill_mesma_clinica"
BEFORE INSERT OR UPDATE ON "HospitalBill"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('admissionId', 'Admission', 'closedById', 'User', 'chargeId', 'Charge');

CREATE TRIGGER "hospitalbillitem_mesma_clinica"
BEFORE INSERT OR UPDATE ON "HospitalBillItem"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('billId', 'HospitalBill', 'addedById', 'User');

-- Conta fechada não muda; nenhuma conta se apaga.
CREATE OR REPLACE FUNCTION bloquear_conta_fechada()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Contas hospitalares não podem ser excluídas';
  END IF;
  IF OLD."status" = 'FECHADA' THEN
    RAISE EXCEPTION 'Conta hospitalar fechada não pode ser alterada';
  END IF;
  IF NEW."admissionId" IS DISTINCT FROM OLD."admissionId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'A conta não pode trocar de internação';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hospitalbill_imutavel
BEFORE UPDATE OR DELETE ON "HospitalBill"
FOR EACH ROW EXECUTE FUNCTION bloquear_conta_fechada();

-- Linhas só entram, mudam ou saem enquanto a conta está aberta.
CREATE OR REPLACE FUNCTION conferir_item_conta()
RETURNS trigger AS $$
DECLARE
  conta text;
BEGIN
  SELECT "status" INTO conta FROM "HospitalBill" WHERE "id" = COALESCE(NEW."billId", OLD."billId");
  IF conta <> 'ABERTA' THEN
    RAISE EXCEPTION 'Conta hospitalar fechada não pode ser alterada';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."billId" IS DISTINCT FROM OLD."billId" THEN
    RAISE EXCEPTION 'O lançamento não pode mudar de conta';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hospitalbillitem_conta_aberta
BEFORE INSERT OR UPDATE OR DELETE ON "HospitalBillItem"
FOR EACH ROW EXECUTE FUNCTION conferir_item_conta();
