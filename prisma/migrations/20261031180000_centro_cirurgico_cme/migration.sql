-- CreateEnum
CREATE TYPE "SurgeryStatus" AS ENUM ('AGENDADA', 'EM_SALA', 'REALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "AnesthesiaKind" AS ENUM ('GERAL', 'RAQUI', 'PERIDURAL', 'SEDACAO', 'BLOQUEIO', 'LOCAL');

-- CreateEnum
CREATE TYPE "ChecklistPhase" AS ENUM ('ENTRADA', 'PAUSA', 'SAIDA');

-- CreateEnum
CREATE TYPE "SterilizationMethod" AS ENUM ('VAPOR', 'PEROXIDO', 'OXIDO_ETILENO');

-- CreateEnum
CREATE TYPE "LoadResult" AS ENUM ('PENDENTE', 'LIBERADA', 'REPROVADA', 'RECOLHIDA');

-- CreateTable
CREATE TABLE "OperatingRoom" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatingRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Surgery" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "admissionId" TEXT,
    "roomId" TEXT NOT NULL,
    "surgeonId" TEXT NOT NULL,
    "anesthetistId" TEXT,
    "procedure" TEXT NOT NULL,
    "laterality" TEXT,
    "anesthesia" "AnesthesiaKind",
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "expectedMinutes" INTEGER NOT NULL,
    "status" "SurgeryStatus" NOT NULL DEFAULT 'AGENDADA',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientInAt" TIMESTAMP(3),
    "anesthesiaAt" TIMESTAMP(3),
    "incisionAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "patientOutAt" TIMESTAMP(3),
    "operativeNote" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "Surgery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryChecklist" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "phase" "ChecklistPhase" NOT NULL,
    "answers" JSONB NOT NULL,
    "note" TEXT,
    "doneById" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurgeryChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmeKit" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CmeKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SterilizationLoad" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "method" "SterilizationMethod" NOT NULL,
    "equipment" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorId" TEXT NOT NULL,
    "result" "LoadResult" NOT NULL DEFAULT 'PENDENTE',
    "chemicalOk" BOOLEAN,
    "biologicalOk" BOOLEAN,
    "resultAt" TIMESTAMP(3),
    "resultById" TEXT,
    "resultNote" TEXT,

    CONSTRAINT "SterilizationLoad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SterilePackage" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "surgeryId" TEXT,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "discardedAt" TIMESTAMP(3),
    "discardedById" TEXT,
    "discardReason" TEXT,

    CONSTRAINT "SterilePackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatingRoom_clinicId_name_key" ON "OperatingRoom"("clinicId", "name");

-- CreateIndex
CREATE INDEX "Surgery_clinicId_scheduledAt_idx" ON "Surgery"("clinicId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Surgery_roomId_scheduledAt_idx" ON "Surgery"("roomId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "SurgeryChecklist_surgeryId_phase_key" ON "SurgeryChecklist"("surgeryId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "CmeKit_clinicId_name_key" ON "CmeKit"("clinicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SterilizationLoad_clinicId_code_key" ON "SterilizationLoad"("clinicId", "code");

-- CreateIndex
CREATE INDEX "SterilePackage_clinicId_kitId_idx" ON "SterilePackage"("clinicId", "kitId");

-- CreateIndex
CREATE INDEX "SterilePackage_loadId_idx" ON "SterilePackage"("loadId");

-- CreateIndex
CREATE INDEX "SterilePackage_surgeryId_idx" ON "SterilePackage"("surgeryId");

-- AddForeignKey
ALTER TABLE "OperatingRoom" ADD CONSTRAINT "OperatingRoom_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "OperatingRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_surgeonId_fkey" FOREIGN KEY ("surgeonId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_anesthetistId_fkey" FOREIGN KEY ("anesthetistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryChecklist" ADD CONSTRAINT "SurgeryChecklist_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryChecklist" ADD CONSTRAINT "SurgeryChecklist_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "Surgery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryChecklist" ADD CONSTRAINT "SurgeryChecklist_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmeKit" ADD CONSTRAINT "CmeKit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SterilizationLoad" ADD CONSTRAINT "SterilizationLoad_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SterilizationLoad" ADD CONSTRAINT "SterilizationLoad_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SterilizationLoad" ADD CONSTRAINT "SterilizationLoad_resultById_fkey" FOREIGN KEY ("resultById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SterilePackage" ADD CONSTRAINT "SterilePackage_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SterilePackage" ADD CONSTRAINT "SterilePackage_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "SterilizationLoad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SterilePackage" ADD CONSTRAINT "SterilePackage_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "CmeKit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SterilePackage" ADD CONSTRAINT "SterilePackage_surgeryId_fkey" FOREIGN KEY ("surgeryId") REFERENCES "Surgery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SterilePackage" ADD CONSTRAINT "SterilePackage_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SterilePackage" ADD CONSTRAINT "SterilePackage_discardedById_fkey" FOREIGN KEY ("discardedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_duracao" CHECK ("expectedMinutes" BETWEEN 10 AND 1440);
ALTER TABLE "CmeKit" ADD CONSTRAINT "CmeKit_validade" CHECK ("validityDays" BETWEEN 1 AND 365);
-- Pacote usado numa cirurgia ou descartado, nunca os dois.
ALTER TABLE "SterilePackage" ADD CONSTRAINT "SterilePackage_destino" CHECK ("usedAt" IS NULL OR "discardedAt" IS NULL);

-- Trava de mesma clínica (ver 20261030200000_mesma_clinica).
CREATE TRIGGER "surgery_mesma_clinica"
BEFORE INSERT OR UPDATE ON "Surgery"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica(
  'patientId', 'Patient', 'admissionId', 'Admission', 'roomId', 'OperatingRoom', 'surgeonId', 'User', 'anesthetistId', 'User',
  'createdById', 'User', 'canceledById', 'User');

CREATE TRIGGER "surgerychecklist_mesma_clinica"
BEFORE INSERT OR UPDATE ON "SurgeryChecklist"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('surgeryId', 'Surgery', 'doneById', 'User');

CREATE TRIGGER "sterilizationload_mesma_clinica"
BEFORE INSERT OR UPDATE ON "SterilizationLoad"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('operatorId', 'User', 'resultById', 'User');

CREATE TRIGGER "sterilepackage_mesma_clinica"
BEFORE INSERT OR UPDATE ON "SterilePackage"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica(
  'loadId', 'SterilizationLoad', 'kitId', 'CmeKit', 'surgeryId', 'Surgery', 'usedById', 'User', 'discardedById', 'User');

-- Checklist de cirurgia segura não muda nem some.
CREATE TRIGGER surgerychecklist_imutavel
BEFORE UPDATE OR DELETE ON "SurgeryChecklist"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_total();

-- Cirurgia não se apaga: cancela.
CREATE OR REPLACE FUNCTION bloquear_exclusao()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registros de % não podem ser excluídos', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER surgery_sem_exclusao
BEFORE DELETE ON "Surgery"
FOR EACH ROW EXECUTE FUNCTION bloquear_exclusao();

-- Carga: só o resultado muda, e na ordem certa (pendente -> liberada/reprovada; liberada -> recolhida).
CREATE OR REPLACE FUNCTION conferir_carga_esterilizacao()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cargas de esterilização não podem ser excluídas';
  END IF;
  IF (to_jsonb(NEW) - 'result' - 'chemicalOk' - 'biologicalOk' - 'resultAt' - 'resultById' - 'resultNote')
     IS DISTINCT FROM (to_jsonb(OLD) - 'result' - 'chemicalOk' - 'biologicalOk' - 'resultAt' - 'resultById' - 'resultNote') THEN
    RAISE EXCEPTION 'Os dados da carga não podem ser alterados';
  END IF;
  IF NOT ((OLD."result" = 'PENDENTE' AND NEW."result" IN ('LIBERADA', 'REPROVADA'))
       OR (OLD."result" = 'LIBERADA' AND NEW."result" = 'RECOLHIDA')) THEN
    RAISE EXCEPTION 'Resultado da carga não pode passar de % para %', OLD."result", NEW."result";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sterilizationload_resultado
BEFORE UPDATE OR DELETE ON "SterilizationLoad"
FOR EACH ROW EXECUTE FUNCTION conferir_carga_esterilizacao();

-- Pacote: só registra o uso (uma vez) ou o descarte (uma vez).
CREATE OR REPLACE FUNCTION conferir_pacote_esteril()
RETURNS trigger AS $$
DECLARE
  uso text[] := ARRAY['surgeryId', 'usedAt', 'usedById'];
  descarte text[] := ARRAY['discardedAt', 'discardedById', 'discardReason'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Pacotes esterilizados não podem ser excluídos; descarte';
  END IF;
  IF (to_jsonb(NEW) - uso - descarte) IS DISTINCT FROM (to_jsonb(OLD) - uso - descarte) THEN
    RAISE EXCEPTION 'Os dados do pacote não podem ser alterados';
  END IF;
  IF OLD."usedAt" IS NOT NULL AND (to_jsonb(NEW) - descarte) IS DISTINCT FROM (to_jsonb(OLD) - descarte) THEN
    RAISE EXCEPTION 'Pacote já usado não muda';
  END IF;
  IF OLD."discardedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Pacote já descartado não muda';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sterilepackage_uso
BEFORE UPDATE OR DELETE ON "SterilePackage"
FOR EACH ROW EXECUTE FUNCTION conferir_pacote_esteril();
