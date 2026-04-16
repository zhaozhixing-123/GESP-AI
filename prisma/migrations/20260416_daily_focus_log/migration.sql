-- CreateTable
CREATE TABLE "DailyFocusLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "focusMs" INTEGER NOT NULL DEFAULT 0,
    "distractMs" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyFocusLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyFocusLog_userId_date_key" ON "DailyFocusLog"("userId", "date");

-- AddForeignKey
ALTER TABLE "DailyFocusLog" ADD CONSTRAINT "DailyFocusLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
