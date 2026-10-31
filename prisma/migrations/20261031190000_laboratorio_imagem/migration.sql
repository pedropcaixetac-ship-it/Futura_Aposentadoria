-- CreateEnum
CREATE TYPE "ExamSector" AS ENUM ('LABORATORIO', 'IMAGEM');

-- CreateEnum
CREATE TYPE "ExamPriority" AS ENUM ('ROTINA', 'URGENTE');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('SOLICITADO', 'AGENDADO', 'COLETADO', 'LAUDADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "ExamType" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "sector" "ExamSector" NOT NULL,
    "name" TEXT NOT NULL,
    "modality" TEXT,
    "sample" TEXT,
    "preparation" TEXT,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamRequest" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "examTypeId" TEXT NOT NULL,
    "admissionId" TEXT,
    "emergencyVisitId" TEXT,
    "requestedById" TEXT,
    "externalRequester" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority" "ExamPriority" NOT NULL DEFAULT 'ROTINA',
    "clinicalInfo" TEXT,
    "status" "ExamStatus" NOT NULL DEFAULT 'SOLICITADO',
    "scheduledAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "collectedById" TEXT,
    "resultAt" TIMESTAMP(3),
    "resultById" TEXT,
    "values" JSONB,
    "report" TEXT,
    "criticalNote" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "ExamRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamType_clinicId_name_key" ON "ExamType"("clinicId", "name");

-- CreateIndex
CREATE INDEX "ExamRequest_clinicId_status_idx" ON "ExamRequest"("clinicId", "status");

-- CreateIndex
CREATE INDEX "ExamRequest_clinicId_scheduledAt_idx" ON "ExamRequest"("clinicId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ExamRequest_admissionId_idx" ON "ExamRequest"("admissionId");

-- CreateIndex
CREATE INDEX "ExamRequest_emergencyVisitId_idx" ON "ExamRequest"("emergencyVisitId");

-- CreateIndex
CREATE INDEX "ExamRequest_patientId_idx" ON "ExamRequest"("patientId");

-- AddForeignKey
ALTER TABLE "ExamType" ADD CONSTRAINT "ExamType_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRequest" ADD CONSTRAINT "ExamRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRequest" ADD CONSTRAINT "ExamRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRequest" ADD CONSTRAINT "ExamRequest_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "ExamType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRequest" ADD CONSTRAINT "ExamRequest_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRequest" ADD CONSTRAINT "ExamRequest_emergencyVisitId_fkey" FOREIGN KEY ("emergencyVisitId") REFERENCES "EmergencyVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRequest" ADD CONSTRAINT "ExamRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRequest" ADD CONSTRAINT "ExamRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRequest" ADD CONSTRAINT "ExamRequest_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRequest" ADD CONSTRAINT "ExamRequest_resultById_fkey" FOREIGN KEY ("resultById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRequest" ADD CONSTRAINT "ExamRequest_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Todo pedido tem quem pediu: médico do hospital ou médico de fora.
ALTER TABLE "ExamRequest" ADD CONSTRAINT "ExamRequest_solicitante" CHECK ("requestedById" IS NOT NULL OR "externalRequester" IS NOT NULL);
-- No máximo um contexto: internação ou pronto-socorro (ou nenhum, no ambulatorial).
ALTER TABLE "ExamRequest" ADD CONSTRAINT "ExamRequest_contexto" CHECK ("admissionId" IS NULL OR "emergencyVisitId" IS NULL);

-- Trava de mesma clínica (ver 20261030200000_mesma_clinica).
CREATE TRIGGER "examrequest_mesma_clinica"
BEFORE INSERT OR UPDATE ON "ExamRequest"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica(
  'patientId', 'Patient', 'examTypeId', 'ExamType', 'admissionId', 'Admission', 'emergencyVisitId', 'EmergencyVisit',
  'requestedById', 'User', 'createdById', 'User', 'collectedById', 'User', 'resultById', 'User', 'canceledById', 'User');

-- Exame laudado ou cancelado não muda mais; nenhum pedido se apaga.
CREATE OR REPLACE FUNCTION bloquear_exame_encerrado()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Pedidos de exame não podem ser excluídos; cancele';
  END IF;
  IF OLD."status" IN ('LAUDADO', 'CANCELADO') THEN
    RAISE EXCEPTION 'Exame já laudado ou cancelado não pode ser alterado';
  END IF;
  IF NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."examTypeId" IS DISTINCT FROM OLD."examTypeId"
     OR NEW."requestedById" IS DISTINCT FROM OLD."requestedById" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'O pedido de exame não pode trocar de paciente, exame ou solicitante';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER examrequest_imutavel
BEFORE UPDATE OR DELETE ON "ExamRequest"
FOR EACH ROW EXECUTE FUNCTION bloquear_exame_encerrado();
