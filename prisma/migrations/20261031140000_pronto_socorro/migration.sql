-- Hospital: pronto-socorro (chegada, triagem com classificação de risco, fila do médico e desfecho).

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL');

-- CreateEnum
CREATE TYPE "EmergencyStatus" AS ENUM ('AGUARDANDO_TRIAGEM', 'AGUARDANDO_MEDICO', 'EM_ATENDIMENTO', 'OBSERVACAO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "EmergencyOutcome" AS ENUM ('ALTA', 'INTERNACAO', 'TRANSFERENCIA', 'OBITO', 'EVASAO');



-- CreateTable
CREATE TABLE "EmergencyVisit" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complaint" TEXT NOT NULL,
    "arrivalMode" TEXT,
    "companion" TEXT,
    "registeredById" TEXT NOT NULL,
    "status" "EmergencyStatus" NOT NULL DEFAULT 'AGUARDANDO_TRIAGEM',
    "risk" "RiskLevel",
    "triagedAt" TIMESTAMP(3),
    "triagedById" TEXT,
    "triageVitals" JSONB,
    "pain" INTEGER,
    "triageNote" TEXT,
    "calledAt" TIMESTAMP(3),
    "doctorId" TEXT,
    "encounterId" TEXT,
    "outcome" "EmergencyOutcome",
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closeNote" TEXT,

    CONSTRAINT "EmergencyVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyVisit_encounterId_key" ON "EmergencyVisit"("encounterId");

-- CreateIndex
CREATE INDEX "EmergencyVisit_clinicId_status_idx" ON "EmergencyVisit"("clinicId", "status");

-- CreateIndex
CREATE INDEX "EmergencyVisit_clinicId_arrivedAt_idx" ON "EmergencyVisit"("clinicId", "arrivedAt");

-- AddForeignKey
ALTER TABLE "EmergencyVisit" ADD CONSTRAINT "EmergencyVisit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyVisit" ADD CONSTRAINT "EmergencyVisit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyVisit" ADD CONSTRAINT "EmergencyVisit_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyVisit" ADD CONSTRAINT "EmergencyVisit_triagedById_fkey" FOREIGN KEY ("triagedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyVisit" ADD CONSTRAINT "EmergencyVisit_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyVisit" ADD CONSTRAINT "EmergencyVisit_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyVisit" ADD CONSTRAINT "EmergencyVisit_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Só uma passagem aberta pelo pronto-socorro por paciente.
CREATE UNIQUE INDEX "EmergencyVisit_paciente_aberto" ON "EmergencyVisit"("patientId") WHERE "closedAt" IS NULL;

-- Trava de mesma clínica (ver 20261030200000_mesma_clinica).
CREATE TRIGGER "emergencyvisit_mesma_clinica"
BEFORE INSERT OR UPDATE ON "EmergencyVisit"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica(
  'patientId', 'Patient', 'registeredById', 'User', 'triagedById', 'User',
  'doctorId', 'User', 'encounterId', 'Encounter', 'closedById', 'User');
