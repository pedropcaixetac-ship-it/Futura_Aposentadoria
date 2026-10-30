-- O endereço antigo (um campo só) passa a ser a "rua"; o resto vira campos separados.
ALTER TABLE "Patient" RENAME COLUMN "address" TO "street";

ALTER TABLE "Patient"
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "cns" TEXT,
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "guardianCpf" TEXT,
ADD COLUMN     "guardianPhone" TEXT,
ADD COLUMN     "guardianRelationship" TEXT,
ADD COLUMN     "insuranceValidUntil" TIMESTAMP(3),
ADD COLUMN     "landline" TEXT,
ADD COLUMN     "lgpdConsentAt" TIMESTAMP(3),
ADD COLUMN     "maritalStatus" TEXT,
ADD COLUMN     "motherName" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "phoneWhatsapp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "photo" TEXT,
ADD COLUMN     "referralSource" TEXT,
ADD COLUMN     "registrationComplete" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rg" TEXT,
ADD COLUMN     "state" TEXT;

-- Telefones passam a ser guardados só com os números, para a busca funcionar.
UPDATE "Patient" SET "phone" = NULLIF(regexp_replace("phone", '\D', '', 'g'), '');

-- Pacientes antigos sem os dados obrigatórios ficam marcados como "cadastro incompleto".
UPDATE "Patient" SET "registrationComplete" = false
WHERE "cpf" IS NULL OR "birthDate" IS NULL OR "phone" IS NULL;

CREATE UNIQUE INDEX "Patient_clinicId_cns_key" ON "Patient"("clinicId", "cns");
