-- Pessoas da equipe que não usam o sistema (ex.: limpeza): sem e-mail e sem login.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL,
ADD COLUMN "systemAccess" BOOLEAN NOT NULL DEFAULT true;
