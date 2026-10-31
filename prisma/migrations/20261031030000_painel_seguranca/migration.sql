-- Segurança do Painel do dono: equipe com dono, senha provisória e verificação em duas etapas.
ALTER TABLE "PlatformUser" ADD COLUMN "owner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformUser" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformUser" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "PlatformUser" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "PlatformUser" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
ALTER TABLE "PlatformUser" ADD COLUMN "totpLastStep" INTEGER;
ALTER TABLE "PlatformUser" ADD COLUMN "totpRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Quem já tinha acesso ao painel era o dono.
UPDATE "PlatformUser" SET "owner" = true;
