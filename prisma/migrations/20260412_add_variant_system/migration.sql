-- AlterTable: WrongBook - make problemId nullable, add variantId
ALTER TABLE "WrongBook" ALTER COLUMN "problemId" DROP NOT NULL;
ALTER TABLE "WrongBook" ADD COLUMN "variantId" INTEGER;
ALTER TABLE "WrongBook" ADD CONSTRAINT "WrongBook_userId_variantId_key" UNIQUE ("userId", "variantId");
ALTER TABLE "WrongBook" ADD CONSTRAINT "WrongBook_variant_fkey"
  FOREIGN KEY ("variantId") REFERENCES "VariantProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: WrongBookAnalysis - make problemId/submissionId nullable, add variantId/variantSubmissionId
ALTER TABLE "WrongBookAnalysis" ALTER COLUMN "problemId" DROP NOT NULL;
ALTER TABLE "WrongBookAnalysis" ALTER COLUMN "submissionId" DROP NOT NULL;
ALTER TABLE "WrongBookAnalysis" ADD COLUMN "variantId" INTEGER;
ALTER TABLE "WrongBookAnalysis" ADD COLUMN "variantSubmissionId" INTEGER;
ALTER TABLE "WrongBookAnalysis" ADD CONSTRAINT "WrongBookAnalysis_userId_variantId_key" UNIQUE ("userId", "variantId");

-- AlterTable: ChatHistory - make problemId nullable, add variantId
ALTER TABLE "ChatHistory" ALTER COLUMN "problemId" DROP NOT NULL;
ALTER TABLE "ChatHistory" ADD COLUMN "variantId" INTEGER;

-- AlterTable: User - no column changes needed (relations only)

-- CreateTable: VariantProblem
CREATE TABLE "VariantProblem" (
    "id"            SERIAL NOT NULL,
    "sourceId"      INTEGER NOT NULL,
    "title"         TEXT NOT NULL,
    "description"   TEXT NOT NULL,
    "inputFormat"   TEXT NOT NULL,
    "outputFormat"  TEXT NOT NULL,
    "samples"       TEXT NOT NULL,
    "testCases"     TEXT NOT NULL DEFAULT '[]',
    "tags"          TEXT NOT NULL DEFAULT '[]',
    "level"         INTEGER NOT NULL,
    "genStatus"     TEXT NOT NULL DEFAULT 'pending',
    "genError"      TEXT,
    "genModel"      TEXT,
    "verifiedAt"    TIMESTAMP(3),
    "verifiedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: VariantUnlock
CREATE TABLE "VariantUnlock" (
    "id"         SERIAL NOT NULL,
    "userId"     INTEGER NOT NULL,
    "problemId"  INTEGER NOT NULL,
    "batch"      INTEGER NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantUnlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VariantUnlock_userId_problemId_batch_key"
  ON "VariantUnlock"("userId", "problemId", "batch");

-- CreateTable: VariantSubmission
CREATE TABLE "VariantSubmission" (
    "id"         SERIAL NOT NULL,
    "userId"     INTEGER NOT NULL,
    "variantId"  INTEGER NOT NULL,
    "code"       TEXT NOT NULL,
    "language"   TEXT NOT NULL DEFAULT 'cpp',
    "status"     TEXT NOT NULL,
    "timeUsed"   INTEGER,
    "memoryUsed" INTEGER,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantSubmission_pkey" PRIMARY KEY ("id")
);

-- AddForeignKeys
ALTER TABLE "VariantProblem"   ADD CONSTRAINT "VariantProblem_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VariantUnlock"    ADD CONSTRAINT "VariantUnlock_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VariantUnlock"    ADD CONSTRAINT "VariantUnlock_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VariantSubmission" ADD CONSTRAINT "VariantSubmission_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VariantSubmission" ADD CONSTRAINT "VariantSubmission_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "VariantProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WrongBook"         ADD CONSTRAINT "WrongBook_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "VariantProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WrongBookAnalysis" ADD CONSTRAINT "WrongBookAnalysis_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "VariantProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WrongBookAnalysis" ADD CONSTRAINT "WrongBookAnalysis_variantSubmissionId_fkey"
  FOREIGN KEY ("variantSubmissionId") REFERENCES "VariantSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatHistory"  ADD CONSTRAINT "ChatHistory_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "VariantProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
