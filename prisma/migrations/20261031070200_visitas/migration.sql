-- Hospital: visitas aos pacientes internados, registradas pela recepção.

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "visitorDocument" TEXT,
    "relationship" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "registeredById" TEXT NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visit_clinicId_enteredAt_idx" ON "Visit"("clinicId", "enteredAt");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Trava de mesma clínica (ver 20261030200000_mesma_clinica).
CREATE TRIGGER "visit_mesma_clinica"
BEFORE INSERT OR UPDATE ON "Visit"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('admissionId', 'Admission', 'registeredById', 'User');
