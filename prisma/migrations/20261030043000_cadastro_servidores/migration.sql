-- Cadastro de servidores: função, abas liberadas por pessoa e desligamento.
ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT,
ADD COLUMN "customTabs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowedTabs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "terminatedAt" DATE,
ADD COLUMN "terminationReason" TEXT;
