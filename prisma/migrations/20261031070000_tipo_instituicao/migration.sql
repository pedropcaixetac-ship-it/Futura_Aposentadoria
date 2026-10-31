-- Tipo de instituição (clínica ou hospital). Todas as existentes continuam clínicas.
-- CreateEnum
CREATE TYPE "InstitutionKind" AS ENUM ('CLINICA', 'HOSPITAL');

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN "kind" "InstitutionKind" NOT NULL DEFAULT 'CLINICA';
