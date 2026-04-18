-- AlterTable: 加内部账号标记
ALTER TABLE "User" ADD COLUMN "isInternal" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: 埋点事件表
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "userId" INTEGER,
    "anonymousId" TEXT NOT NULL,
    "path" TEXT,
    "problemId" INTEGER,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_type_createdAt_idx" ON "Event"("type", "createdAt");
CREATE INDEX "Event_userId_createdAt_idx" ON "Event"("userId", "createdAt");
CREATE INDEX "Event_anonymousId_createdAt_idx" ON "Event"("anonymousId", "createdAt");
