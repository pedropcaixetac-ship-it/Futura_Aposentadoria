-- Hospital: prescrição do médico e checagem da enfermagem (internação e pronto-socorro).

-- CreateEnum
CREATE TYPE "PrescriptionKind" AS ENUM ('MEDICAMENTO', 'CUIDADO', 'DIETA');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('FEITO', 'NAO_FEITO');



-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "admissionId" TEXT,
    "emergencyVisitId" TEXT,
    "prescriberId" TEXT NOT NULL,
    "kind" "PrescriptionKind" NOT NULL DEFAULT 'MEDICAMENTO',
    "description" TEXT NOT NULL,
    "dose" TEXT,
    "route" TEXT,
    "intervalHours" INTEGER,
    "asNeeded" BOOLEAN NOT NULL DEFAULT false,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMP(3),
    "suspendedById" TEXT,
    "suspendReason" TEXT,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationCheck" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "status" "CheckStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "MedicationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrescriptionItem_admissionId_idx" ON "PrescriptionItem"("admissionId");

-- CreateIndex
CREATE INDEX "PrescriptionItem_emergencyVisitId_idx" ON "PrescriptionItem"("emergencyVisitId");

-- CreateIndex
CREATE INDEX "MedicationCheck_itemId_idx" ON "MedicationCheck"("itemId");

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_emergencyVisitId_fkey" FOREIGN KEY ("emergencyVisitId") REFERENCES "EmergencyVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriberId_fkey" FOREIGN KEY ("prescriberId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_suspendedById_fkey" FOREIGN KEY ("suspendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationCheck" ADD CONSTRAINT "MedicationCheck_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationCheck" ADD CONSTRAINT "MedicationCheck_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PrescriptionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationCheck" ADD CONSTRAINT "MedicationCheck_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationCheck" ADD CONSTRAINT "MedicationCheck_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Um horário só tem uma checagem valendo (a anulada não conta).
CREATE UNIQUE INDEX "MedicationCheck_horario_unico" ON "MedicationCheck"("itemId", "scheduledAt") WHERE "canceledAt" IS NULL AND "scheduledAt" IS NOT NULL;

-- Item vale para a internação OU para o pronto-socorro.
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_um_contexto" CHECK (("admissionId" IS NULL) <> ("emergencyVisitId" IS NULL));

-- Trava de mesma clínica (ver 20261030200000_mesma_clinica).
CREATE TRIGGER "prescriptionitem_mesma_clinica"
BEFORE INSERT OR UPDATE ON "PrescriptionItem"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica(
  'patientId', 'Patient', 'admissionId', 'Admission', 'emergencyVisitId', 'EmergencyVisit',
  'prescriberId', 'User', 'suspendedById', 'User');

CREATE TRIGGER "medicationcheck_mesma_clinica"
BEFORE INSERT OR UPDATE ON "MedicationCheck"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('itemId', 'PrescriptionItem', 'recordedById', 'User', 'canceledById', 'User');

-- Item prescrito não muda nem some: só pode ser suspenso, uma vez.
CREATE OR REPLACE FUNCTION bloquear_alteracao_exceto_suspensao()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Itens da prescrição não podem ser excluídos; suspenda o item';
  END IF;
  IF OLD."suspendedAt" IS NOT NULL
    OR NEW."suspendedAt" IS NULL
    OR (to_jsonb(NEW) - 'suspendedAt' - 'suspendedById' - 'suspendReason') IS DISTINCT FROM (to_jsonb(OLD) - 'suspendedAt' - 'suspendedById' - 'suspendReason') THEN
    RAISE EXCEPTION 'Itens da prescrição não podem ser alterados; suspenda e prescreva de novo';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prescriptionitem_imutavel
BEFORE UPDATE OR DELETE ON "PrescriptionItem"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_exceto_suspensao();

-- Checagem: mesma regra dos sinais vitais (só anula).
CREATE TRIGGER medicationcheck_imutavel
BEFORE UPDATE OR DELETE ON "MedicationCheck"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_exceto_anulacao();
