-- Hospital: alas, leitos, internações e trocas de leito.

-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('LIVRE', 'LIMPEZA', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "DischargeKind" AS ENUM ('MELHORADO', 'A_PEDIDO', 'TRANSFERENCIA', 'OBITO', 'EVASAO');

-- CreateTable
CREATE TABLE "Ward" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'Enfermaria',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'LIVRE',
    "statusNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admission" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "attendingId" TEXT NOT NULL,
    "admittedById" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin" TEXT NOT NULL,
    "reason" TEXT,
    "cidCode" TEXT,
    "cidDescription" TEXT,
    "insurance" TEXT,
    "dischargedAt" TIMESTAMP(3),
    "dischargeKind" "DischargeKind",
    "dischargeNote" TEXT,
    "dischargedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedMovement" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "fromBedId" TEXT,
    "toBedId" TEXT NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "movedById" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "BedMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ward_clinicId_name_key" ON "Ward"("clinicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_wardId_code_key" ON "Bed"("wardId", "code");

-- CreateIndex
CREATE INDEX "Admission_clinicId_dischargedAt_idx" ON "Admission"("clinicId", "dischargedAt");

-- AddForeignKey
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_attendingId_fkey" FOREIGN KEY ("attendingId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_admittedById_fkey" FOREIGN KEY ("admittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_dischargedById_fkey" FOREIGN KEY ("dischargedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedMovement" ADD CONSTRAINT "BedMovement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedMovement" ADD CONSTRAINT "BedMovement_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedMovement" ADD CONSTRAINT "BedMovement_fromBedId_fkey" FOREIGN KEY ("fromBedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedMovement" ADD CONSTRAINT "BedMovement_toBedId_fkey" FOREIGN KEY ("toBedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedMovement" ADD CONSTRAINT "BedMovement_movedById_fkey" FOREIGN KEY ("movedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Um leito e um paciente só podem ter uma internação sem alta de cada vez.
CREATE UNIQUE INDEX "Admission_leito_ocupado" ON "Admission"("bedId") WHERE "dischargedAt" IS NULL;
CREATE UNIQUE INDEX "Admission_paciente_internado" ON "Admission"("patientId") WHERE "dischargedAt" IS NULL;

-- Trava de mesma clínica (ver 20261030200000_mesma_clinica).
CREATE TRIGGER "bed_mesma_clinica"
BEFORE INSERT OR UPDATE ON "Bed"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('wardId', 'Ward');

CREATE TRIGGER "admission_mesma_clinica"
BEFORE INSERT OR UPDATE ON "Admission"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('patientId', 'Patient', 'bedId', 'Bed', 'attendingId', 'User', 'admittedById', 'User', 'dischargedById', 'User');

CREATE TRIGGER "bedmovement_mesma_clinica"
BEFORE INSERT OR UPDATE ON "BedMovement"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('admissionId', 'Admission', 'fromBedId', 'Bed', 'toBedId', 'Bed', 'movedById', 'User');
