-- CreateTable: 大模型调用记录（成本看板用）
CREATE TABLE "LlmCall" (
    "id" SERIAL NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWrite5mTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWrite1hTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmCall_createdAt_idx" ON "LlmCall"("createdAt");
CREATE INDEX "LlmCall_purpose_createdAt_idx" ON "LlmCall"("purpose", "createdAt");
CREATE INDEX "LlmCall_status_createdAt_idx" ON "LlmCall"("status", "createdAt");
