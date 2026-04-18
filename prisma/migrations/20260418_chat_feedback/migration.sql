-- AlterTable: ChatHistory 关联 LlmCall
ALTER TABLE "ChatHistory" ADD COLUMN "llmCallId" INTEGER;

CREATE INDEX "ChatHistory_llmCallId_idx" ON "ChatHistory"("llmCallId");

ALTER TABLE "ChatHistory"
  ADD CONSTRAINT "ChatHistory_llmCallId_fkey"
  FOREIGN KEY ("llmCallId") REFERENCES "LlmCall"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: 用户显式反馈
CREATE TABLE "Feedback" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER NOT NULL,
    "llmCallId" INTEGER,
    "vote" TEXT NOT NULL,
    "reasons" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Feedback_userId_targetType_targetId_key"
  ON "Feedback"("userId", "targetType", "targetId");

CREATE INDEX "Feedback_targetType_targetId_idx"
  ON "Feedback"("targetType", "targetId");

CREATE INDEX "Feedback_llmCallId_idx"
  ON "Feedback"("llmCallId");

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_llmCallId_fkey"
  FOREIGN KEY ("llmCallId") REFERENCES "LlmCall"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
