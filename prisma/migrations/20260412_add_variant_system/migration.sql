-- ============================================================
-- 幂等迁移：所有语句均可安全重复执行
-- ============================================================

-- Step 1: 先建新表（被旧表外键引用，必须先存在）

CREATE TABLE IF NOT EXISTS "VariantProblem" (
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

DO $$ BEGIN
  ALTER TABLE "VariantProblem" ADD CONSTRAINT "VariantProblem_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "VariantSubmission" (
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

DO $$ BEGIN
  ALTER TABLE "VariantSubmission" ADD CONSTRAINT "VariantSubmission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "VariantSubmission" ADD CONSTRAINT "VariantSubmission_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "VariantProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "VariantUnlock" (
    "id"         SERIAL NOT NULL,
    "userId"     INTEGER NOT NULL,
    "problemId"  INTEGER NOT NULL,
    "batch"      INTEGER NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VariantUnlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VariantUnlock_userId_problemId_batch_key"
  ON "VariantUnlock"("userId", "problemId", "batch");

DO $$ BEGIN
  ALTER TABLE "VariantUnlock" ADD CONSTRAINT "VariantUnlock_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "VariantUnlock" ADD CONSTRAINT "VariantUnlock_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: 修改旧表（全部幂等）

-- WrongBook
ALTER TABLE "WrongBook" ALTER COLUMN "problemId" DROP NOT NULL;
ALTER TABLE "WrongBook" ADD COLUMN IF NOT EXISTS "variantId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "WrongBook_userId_variantId_key"
  ON "WrongBook"("userId", "variantId");
DO $$ BEGIN
  ALTER TABLE "WrongBook" ADD CONSTRAINT "WrongBook_variant_fkey"
    FOREIGN KEY ("variantId") REFERENCES "VariantProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- WrongBookAnalysis
ALTER TABLE "WrongBookAnalysis" ALTER COLUMN "problemId" DROP NOT NULL;
ALTER TABLE "WrongBookAnalysis" ALTER COLUMN "submissionId" DROP NOT NULL;
ALTER TABLE "WrongBookAnalysis" ADD COLUMN IF NOT EXISTS "variantId" INTEGER;
ALTER TABLE "WrongBookAnalysis" ADD COLUMN IF NOT EXISTS "variantSubmissionId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "WrongBookAnalysis_userId_variantId_key"
  ON "WrongBookAnalysis"("userId", "variantId");
DO $$ BEGIN
  ALTER TABLE "WrongBookAnalysis" ADD CONSTRAINT "WrongBookAnalysis_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "VariantProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WrongBookAnalysis" ADD CONSTRAINT "WrongBookAnalysis_variantSubmissionId_fkey"
    FOREIGN KEY ("variantSubmissionId") REFERENCES "VariantSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ChatHistory
ALTER TABLE "ChatHistory" ALTER COLUMN "problemId" DROP NOT NULL;
ALTER TABLE "ChatHistory" ADD COLUMN IF NOT EXISTS "variantId" INTEGER;
DO $$ BEGIN
  ALTER TABLE "ChatHistory" ADD CONSTRAINT "ChatHistory_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "VariantProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
