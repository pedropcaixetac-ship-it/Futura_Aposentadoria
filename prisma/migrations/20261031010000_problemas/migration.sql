-- Problemas do sistema: erros registrados automaticamente e relatos do botão "Relatar problema".
-- CreateTable
CREATE TABLE "ProblemReport" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "clinicId" TEXT,
    "userId" TEXT,
    "message" TEXT NOT NULL,
    "page" TEXT,
    "digest" TEXT,
    "details" TEXT,
    "fingerprint" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProblemReport_resolvedAt_lastSeenAt_idx" ON "ProblemReport"("resolvedAt", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ProblemReport_fingerprint_idx" ON "ProblemReport"("fingerprint");

-- AddForeignKey
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

