-- Hospital: evoluções ligadas à internação, sinais vitais e balanço hídrico dos internados.
-- CreateEnum
CREATE TYPE "EvolutionKind" AS ENUM ('MEDICA', 'ENFERMAGEM', 'MULTIPROFISSIONAL');

-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('MANHA', 'TARDE', 'NOITE');

-- CreateEnum
CREATE TYPE "FluidDirection" AS ENUM ('ENTRADA', 'SAIDA');

ALTER TABLE "Encounter" ADD COLUMN     "admissionId" TEXT,
ADD COLUMN     "evolutionKind" "EvolutionKind",
ADD COLUMN     "shift" "Shift";

-- CreateTable
CREATE TABLE "VitalRecord" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "vitals" JSONB NOT NULL,
    "pain" INTEGER,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "VitalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FluidEntry" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "direction" "FluidDirection" NOT NULL,
    "kind" TEXT NOT NULL,
    "volumeMl" INTEGER NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "FluidEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VitalRecord_admissionId_takenAt_idx" ON "VitalRecord"("admissionId", "takenAt");

-- CreateIndex
CREATE INDEX "FluidEntry_admissionId_at_idx" ON "FluidEntry"("admissionId", "at");

-- CreateIndex
CREATE INDEX "Encounter_admissionId_idx" ON "Encounter"("admissionId");

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalRecord" ADD CONSTRAINT "VitalRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalRecord" ADD CONSTRAINT "VitalRecord_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalRecord" ADD CONSTRAINT "VitalRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalRecord" ADD CONSTRAINT "VitalRecord_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluidEntry" ADD CONSTRAINT "FluidEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluidEntry" ADD CONSTRAINT "FluidEntry_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluidEntry" ADD CONSTRAINT "FluidEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluidEntry" ADD CONSTRAINT "FluidEntry_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Trava de mesma clínica (ver 20261030200000_mesma_clinica); a do atendimento passa a conferir a internação.
DROP TRIGGER "encounter_mesma_clinica" ON "Encounter";
CREATE TRIGGER "encounter_mesma_clinica"
BEFORE INSERT OR UPDATE ON "Encounter"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('patientId', 'Patient', 'professionalId', 'User', 'templateId', 'RecordTemplate', 'admissionId', 'Admission');

CREATE TRIGGER "vitalrecord_mesma_clinica"
BEFORE INSERT OR UPDATE ON "VitalRecord"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('admissionId', 'Admission', 'recordedById', 'User', 'canceledById', 'User');

CREATE TRIGGER "fluidentry_mesma_clinica"
BEFORE INSERT OR UPDATE ON "FluidEntry"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('admissionId', 'Admission', 'recordedById', 'User', 'canceledById', 'User');

-- Sinais vitais e balanço hídrico são prontuário: não são apagados nem alterados.
-- A única mudança aceita é anular um lançamento uma vez, com quem anulou e o motivo.
CREATE OR REPLACE FUNCTION bloquear_alteracao_exceto_anulacao()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Registros de % não podem ser excluídos', TG_TABLE_NAME;
  END IF;
  IF OLD."canceledAt" IS NOT NULL
    OR NEW."canceledAt" IS NULL
    OR (to_jsonb(NEW) - 'canceledAt' - 'canceledById' - 'cancelReason') IS DISTINCT FROM (to_jsonb(OLD) - 'canceledAt' - 'canceledById' - 'cancelReason') THEN
    RAISE EXCEPTION 'Registros de % não podem ser alterados; anule o lançamento errado e registre de novo', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vitalrecord_imutavel
BEFORE UPDATE OR DELETE ON "VitalRecord"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_exceto_anulacao();

CREATE TRIGGER fluidentry_imutavel
BEFORE UPDATE OR DELETE ON "FluidEntry"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_exceto_anulacao();
