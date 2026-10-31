-- CreateEnum
CREATE TYPE "MealKind" AS ENUM ('DESJEJUM', 'COLACAO', 'ALMOCO', 'LANCHE', 'JANTAR', 'CEIA');

-- CreateEnum
CREATE TYPE "MealStatus" AS ENUM ('ENTREGUE', 'RECUSOU', 'NAO_SERVIDO');

-- CreateEnum
CREATE TYPE "IsolationKind" AS ENUM ('CONTATO', 'GOTICULAS', 'AEROSSOIS');

-- CreateEnum
CREATE TYPE "InfectionSite" AS ENUM ('ICS', 'ITU', 'PAV', 'ISC', 'PELE', 'OUTRA');

-- CreateEnum
CREATE TYPE "ChemoSessionStatus" AS ENUM ('AGENDADA', 'REALIZADA', 'ADIADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "MealDelivery" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "meal" "MealKind" NOT NULL,
    "status" "MealStatus" NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "MealDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IsolationPrecaution" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "kind" "IsolationKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedById" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "endReason" TEXT,

    CONSTRAINT "IsolationPrecaution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalInfection" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "site" "InfectionSite" NOT NULL,
    "diagnosedAt" DATE NOT NULL,
    "organism" TEXT,
    "device" TEXT,
    "note" TEXT,
    "reportedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "HospitalInfection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemoProtocol" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cycleDays" INTEGER NOT NULL,
    "drugs" JSONB NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChemoProtocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemoPlan" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "physicianId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "cycles" INTEGER NOT NULL,
    "heightCm" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "bsa" DOUBLE PRECISION NOT NULL,
    "doseLevel" INTEGER NOT NULL DEFAULT 100,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "endReason" TEXT,

    CONSTRAINT "ChemoPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemoSession" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" "ChemoSessionStatus" NOT NULL DEFAULT 'AGENDADA',
    "doses" JSONB NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "administeredAt" TIMESTAMP(3),
    "administeredById" TEXT,
    "note" TEXT,

    CONSTRAINT "ChemoSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealDelivery_clinicId_date_idx" ON "MealDelivery"("clinicId", "date");

-- CreateIndex
CREATE INDEX "MealDelivery_admissionId_idx" ON "MealDelivery"("admissionId");

-- CreateIndex
CREATE INDEX "IsolationPrecaution_clinicId_endedAt_idx" ON "IsolationPrecaution"("clinicId", "endedAt");

-- CreateIndex
CREATE INDEX "IsolationPrecaution_admissionId_idx" ON "IsolationPrecaution"("admissionId");

-- CreateIndex
CREATE INDEX "HospitalInfection_clinicId_diagnosedAt_idx" ON "HospitalInfection"("clinicId", "diagnosedAt");

-- CreateIndex
CREATE INDEX "HospitalInfection_admissionId_idx" ON "HospitalInfection"("admissionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChemoProtocol_clinicId_name_key" ON "ChemoProtocol"("clinicId", "name");

-- CreateIndex
CREATE INDEX "ChemoPlan_clinicId_endedAt_idx" ON "ChemoPlan"("clinicId", "endedAt");

-- CreateIndex
CREATE INDEX "ChemoSession_clinicId_date_idx" ON "ChemoSession"("clinicId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ChemoSession_planId_cycle_day_key" ON "ChemoSession"("planId", "cycle", "day");

-- AddForeignKey
ALTER TABLE "MealDelivery" ADD CONSTRAINT "MealDelivery_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealDelivery" ADD CONSTRAINT "MealDelivery_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealDelivery" ADD CONSTRAINT "MealDelivery_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealDelivery" ADD CONSTRAINT "MealDelivery_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsolationPrecaution" ADD CONSTRAINT "IsolationPrecaution_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsolationPrecaution" ADD CONSTRAINT "IsolationPrecaution_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsolationPrecaution" ADD CONSTRAINT "IsolationPrecaution_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsolationPrecaution" ADD CONSTRAINT "IsolationPrecaution_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInfection" ADD CONSTRAINT "HospitalInfection_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInfection" ADD CONSTRAINT "HospitalInfection_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInfection" ADD CONSTRAINT "HospitalInfection_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInfection" ADD CONSTRAINT "HospitalInfection_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemoProtocol" ADD CONSTRAINT "ChemoProtocol_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemoPlan" ADD CONSTRAINT "ChemoPlan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemoPlan" ADD CONSTRAINT "ChemoPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemoPlan" ADD CONSTRAINT "ChemoPlan_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "ChemoProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemoPlan" ADD CONSTRAINT "ChemoPlan_physicianId_fkey" FOREIGN KEY ("physicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemoPlan" ADD CONSTRAINT "ChemoPlan_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemoSession" ADD CONSTRAINT "ChemoSession_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemoSession" ADD CONSTRAINT "ChemoSession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ChemoPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemoSession" ADD CONSTRAINT "ChemoSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemoSession" ADD CONSTRAINT "ChemoSession_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemoSession" ADD CONSTRAINT "ChemoSession_administeredById_fkey" FOREIGN KEY ("administeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Uma refeição valendo por internação, dia e horário de refeição (anulada não conta).
CREATE UNIQUE INDEX "MealDelivery_uma_por_refeicao" ON "MealDelivery"("admissionId", "date", "meal") WHERE "canceledAt" IS NULL;

-- Um isolamento aberto de cada tipo por internação.
CREATE UNIQUE INDEX "IsolationPrecaution_um_aberto" ON "IsolationPrecaution"("admissionId", "kind") WHERE "endedAt" IS NULL;

ALTER TABLE "ChemoProtocol" ADD CONSTRAINT "ChemoProtocol_ciclo" CHECK ("cycleDays" BETWEEN 1 AND 365);
ALTER TABLE "ChemoPlan" ADD CONSTRAINT "ChemoPlan_valores" CHECK (
  "cycles" BETWEEN 1 AND 60 AND "heightCm" BETWEEN 30 AND 250 AND "weightKg" > 0 AND "weightKg" <= 400
  AND "bsa" > 0 AND "doseLevel" BETWEEN 10 AND 150
);

-- Trava de mesma clínica (ver 20261030200000_mesma_clinica).
CREATE TRIGGER "mealdelivery_mesma_clinica"
BEFORE INSERT OR UPDATE ON "MealDelivery"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica(
  'admissionId', 'Admission', 'recordedById', 'User', 'canceledById', 'User');

CREATE TRIGGER "isolationprecaution_mesma_clinica"
BEFORE INSERT OR UPDATE ON "IsolationPrecaution"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica(
  'admissionId', 'Admission', 'startedById', 'User', 'endedById', 'User');

CREATE TRIGGER "hospitalinfection_mesma_clinica"
BEFORE INSERT OR UPDATE ON "HospitalInfection"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica(
  'admissionId', 'Admission', 'reportedById', 'User', 'canceledById', 'User');

CREATE TRIGGER "chemoplan_mesma_clinica"
BEFORE INSERT OR UPDATE ON "ChemoPlan"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica(
  'patientId', 'Patient', 'protocolId', 'ChemoProtocol', 'physicianId', 'User', 'endedById', 'User');

CREATE TRIGGER "chemosession_mesma_clinica"
BEFORE INSERT OR UPDATE ON "ChemoSession"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica(
  'planId', 'ChemoPlan', 'patientId', 'Patient', 'releasedById', 'User', 'administeredById', 'User');

-- Refeição e infecção notificada: só se anulam.
CREATE TRIGGER mealdelivery_imutavel
BEFORE UPDATE OR DELETE ON "MealDelivery"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_exceto_anulacao();

CREATE TRIGGER hospitalinfection_imutavel
BEFORE UPDATE OR DELETE ON "HospitalInfection"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_exceto_anulacao();

-- Isolamento e tratamento de quimioterapia: só se encerram, uma vez.
CREATE OR REPLACE FUNCTION bloquear_alteracao_exceto_encerramento()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Registros de % não podem ser excluídos; encerre', TG_TABLE_NAME;
  END IF;
  IF OLD."endedAt" IS NOT NULL
    OR NEW."endedAt" IS NULL
    OR (to_jsonb(NEW) - 'endedAt' - 'endedById' - 'endReason') IS DISTINCT FROM (to_jsonb(OLD) - 'endedAt' - 'endedById' - 'endReason') THEN
    RAISE EXCEPTION 'Registros de % não podem ser alterados; só encerrados', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER isolationprecaution_imutavel
BEFORE UPDATE OR DELETE ON "IsolationPrecaution"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_exceto_encerramento();

CREATE TRIGGER chemoplan_imutavel
BEFORE UPDATE OR DELETE ON "ChemoPlan"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_exceto_encerramento();

-- Sessão de quimioterapia aplicada não muda mais, e nenhuma sessão é apagada.
CREATE OR REPLACE FUNCTION bloquear_sessao_aplicada()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Sessões de quimioterapia não podem ser excluídas; cancele';
  END IF;
  IF OLD."status" IN ('REALIZADA', 'CANCELADA') THEN
    RAISE EXCEPTION 'Sessão de quimioterapia já encerrada não pode ser alterada';
  END IF;
  IF NEW."doses" IS DISTINCT FROM OLD."doses" OR NEW."planId" IS DISTINCT FROM OLD."planId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" THEN
    RAISE EXCEPTION 'As doses da sessão não mudam; ajuste o tratamento';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chemosession_imutavel
BEFORE UPDATE OR DELETE ON "ChemoSession"
FOR EACH ROW EXECUTE FUNCTION bloquear_sessao_aplicada();
