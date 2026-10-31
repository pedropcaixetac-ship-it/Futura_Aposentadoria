-- Especialidades no hospital (pedido de Pedro no teste de caos de 31/10): pedido de parecer entre especialidades
-- e transferência do paciente de uma especialidade para outra.

-- CreateEnum
CREATE TYPE "ConsultStatus" AS ENUM ('PENDENTE', 'RESPONDIDO', 'CANCELADO');

-- AlterTable
ALTER TABLE "Admission" ADD COLUMN     "specialty" TEXT;

-- CreateTable
CREATE TABLE "ConsultRequest" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "consultantId" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "question" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ConsultStatus" NOT NULL DEFAULT 'PENDENTE',
    "answer" TEXT,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    "tookOver" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "ConsultRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendingChange" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "fromAttendingId" TEXT NOT NULL,
    "toAttendingId" TEXT NOT NULL,
    "fromSpecialty" TEXT,
    "toSpecialty" TEXT,
    "reason" TEXT,
    "consultId" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendingChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultRequest_clinicId_status_specialty_idx" ON "ConsultRequest"("clinicId", "status", "specialty");

-- CreateIndex
CREATE INDEX "ConsultRequest_admissionId_idx" ON "ConsultRequest"("admissionId");

-- CreateIndex
CREATE INDEX "AttendingChange_admissionId_idx" ON "AttendingChange"("admissionId");

-- AddForeignKey
ALTER TABLE "ConsultRequest" ADD CONSTRAINT "ConsultRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultRequest" ADD CONSTRAINT "ConsultRequest_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultRequest" ADD CONSTRAINT "ConsultRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultRequest" ADD CONSTRAINT "ConsultRequest_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultRequest" ADD CONSTRAINT "ConsultRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultRequest" ADD CONSTRAINT "ConsultRequest_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultRequest" ADD CONSTRAINT "ConsultRequest_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendingChange" ADD CONSTRAINT "AttendingChange_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendingChange" ADD CONSTRAINT "AttendingChange_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendingChange" ADD CONSTRAINT "AttendingChange_fromAttendingId_fkey" FOREIGN KEY ("fromAttendingId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendingChange" ADD CONSTRAINT "AttendingChange_toAttendingId_fkey" FOREIGN KEY ("toAttendingId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendingChange" ADD CONSTRAINT "AttendingChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Internações abertas e antigas ganham a especialidade do médico responsável.
UPDATE "Admission" a SET "specialty" = u."specialty" FROM "User" u WHERE u.id = a."attendingId" AND a."specialty" IS NULL;

-- Trava de mesma clínica (ver 20261030200000_mesma_clinica).
CREATE TRIGGER "consultrequest_mesma_clinica"
BEFORE INSERT OR UPDATE ON "ConsultRequest"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('admissionId', 'Admission', 'patientId', 'Patient', 'consultantId', 'User', 'requestedById', 'User', 'answeredById', 'User', 'canceledById', 'User');

CREATE TRIGGER "attendingchange_mesma_clinica"
BEFORE INSERT OR UPDATE ON "AttendingChange"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('admissionId', 'Admission', 'fromAttendingId', 'User', 'toAttendingId', 'User', 'changedById', 'User', 'consultId', 'ConsultRequest');

-- Parecer respondido ou cancelado fica como está (é registro do prontuário); nada se apaga.
CREATE OR REPLACE FUNCTION parecer_congelado()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Pedido de parecer não pode ser apagado';
  END IF;
  IF OLD."status" <> 'PENDENTE' THEN
    RAISE EXCEPTION 'Parecer já respondido ou cancelado não pode ser alterado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "consultrequest_congelado"
BEFORE UPDATE OR DELETE ON "ConsultRequest"
FOR EACH ROW EXECUTE FUNCTION parecer_congelado();

-- O histórico de transferências entre especialidades não muda nem se apaga.
CREATE OR REPLACE FUNCTION historico_imutavel()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registro de histórico (%) não pode ser alterado nem apagado', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "attendingchange_imutavel"
BEFORE UPDATE OR DELETE ON "AttendingChange"
FOR EACH ROW EXECUTE FUNCTION historico_imutavel();
