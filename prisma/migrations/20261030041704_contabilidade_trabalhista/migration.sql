-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('CLT', 'PJ', 'ESTAGIO', 'AUTONOMO');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ADMINISTRATIVO';

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "accountantEmail" TEXT,
ADD COLUMN     "accountantName" TEXT,
ADD COLUMN     "accountantPhone" TEXT,
ADD COLUMN     "taxRegime" TEXT;

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "pis" TEXT,
    "birthDate" DATE,
    "phone" TEXT,
    "email" TEXT,
    "jobTitle" TEXT NOT NULL,
    "sector" TEXT,
    "type" "EmploymentType" NOT NULL DEFAULT 'CLT',
    "admissionDate" DATE NOT NULL,
    "salaryCents" INTEGER NOT NULL,
    "weeklyHours" INTEGER,
    "paymentInfo" TEXT,
    "terminatedAt" DATE,
    "terminationReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vacation" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vacation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEntry" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "baseCents" INTEGER NOT NULL,
    "absenceDays" INTEGER NOT NULL DEFAULT 0,
    "overtimeHours" INTEGER NOT NULL DEFAULT 0,
    "additionsCents" INTEGER NOT NULL DEFAULT 0,
    "deductionsCents" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER,
    "notes" TEXT,
    "expenseId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxObligation" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "businessDay" BOOLEAN NOT NULL DEFAULT false,
    "onlyMonth" INTEGER,
    "hint" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObligationEntry" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "doneAt" DATE NOT NULL,
    "amountCents" INTEGER,
    "expenseId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObligationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employee_clinicId_name_idx" ON "Employee"("clinicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_clinicId_cpf_key" ON "Employee"("clinicId", "cpf");

-- CreateIndex
CREATE INDEX "Vacation_employeeId_startDate_idx" ON "Vacation"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "PayrollEntry_clinicId_month_idx" ON "PayrollEntry"("clinicId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEntry_employeeId_month_key" ON "PayrollEntry"("employeeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ObligationEntry_obligationId_month_key" ON "ObligationEntry"("obligationId", "month");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacation" ADD CONSTRAINT "Vacation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacation" ADD CONSTRAINT "Vacation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxObligation" ADD CONSTRAINT "TaxObligation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationEntry" ADD CONSTRAINT "ObligationEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationEntry" ADD CONSTRAINT "ObligationEntry_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "TaxObligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
