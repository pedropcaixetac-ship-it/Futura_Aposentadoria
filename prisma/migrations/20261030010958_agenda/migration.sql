-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('CONSULTA', 'RETORNO', 'PROCEDIMENTO');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('AGENDADO', 'CONFIRMADO', 'CHEGOU', 'EM_ATENDIMENTO', 'ATENDIDO', 'FALTOU', 'DESMARCADO');

-- CreateTable
CREATE TABLE "WorkHours" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "slotMinutes" INTEGER NOT NULL,

    CONSTRAINT "WorkHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBlock" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "type" "AppointmentType" NOT NULL DEFAULT 'CONSULTA',
    "insurance" TEXT,
    "notes" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'AGENDADO',
    "arrivedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "encounterId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkHours_clinicId_professionalId_idx" ON "WorkHours"("clinicId", "professionalId");

-- CreateIndex
CREATE INDEX "ScheduleBlock_clinicId_professionalId_startsAt_idx" ON "ScheduleBlock"("clinicId", "professionalId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_encounterId_key" ON "Appointment"("encounterId");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_startsAt_idx" ON "Appointment"("clinicId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_professionalId_startsAt_idx" ON "Appointment"("clinicId", "professionalId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_patientId_idx" ON "Appointment"("clinicId", "patientId");

-- AddForeignKey
ALTER TABLE "WorkHours" ADD CONSTRAINT "WorkHours_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkHours" ADD CONSTRAINT "WorkHours_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
