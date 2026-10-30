-- Profissional de saúde com acesso restrito ao prontuário (técnico/auxiliar de enfermagem).
ALTER TYPE "Role" ADD VALUE 'TECNICO';

-- Identificação, contato e endereço do servidor, como no cadastro de paciente.
ALTER TABLE "User" ADD COLUMN "socialName" TEXT,
ADD COLUMN "birthDate" DATE,
ADD COLUMN "sex" TEXT,
ADD COLUMN "rg" TEXT,
ADD COLUMN "cns" TEXT,
ADD COLUMN "motherName" TEXT,
ADD COLUMN "maritalStatus" TEXT,
ADD COLUMN "photo" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "landline" TEXT,
ADD COLUMN "emergencyContactName" TEXT,
ADD COLUMN "emergencyContactPhone" TEXT,
ADD COLUMN "cep" TEXT,
ADD COLUMN "street" TEXT,
ADD COLUMN "number" TEXT,
ADD COLUMN "complement" TEXT,
ADD COLUMN "district" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT;
