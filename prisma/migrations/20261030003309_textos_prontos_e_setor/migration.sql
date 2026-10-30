-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sector" TEXT;

-- CreateTable
CREATE TABLE "TextSnippet" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fieldKey" TEXT,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TextSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TextSnippet_ownerId_fieldKey_idx" ON "TextSnippet"("ownerId", "fieldKey");

-- AddForeignKey
ALTER TABLE "TextSnippet" ADD CONSTRAINT "TextSnippet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
