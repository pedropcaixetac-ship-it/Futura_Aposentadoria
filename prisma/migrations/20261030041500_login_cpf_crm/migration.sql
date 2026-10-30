-- AlterTable
-- IF NOT EXISTS: a versão de teste da assinatura digital já tinha criado esta
-- coluna em alguns bancos antes deste login por CPF existir.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cpf" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_clinicId_cpf_key" ON "User"("clinicId", "cpf");
