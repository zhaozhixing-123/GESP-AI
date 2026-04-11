-- CreateTable
CREATE TABLE "WrongBookAnalysis" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WrongBookAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WrongBookAnalysis_userId_problemId_key" ON "WrongBookAnalysis"("userId", "problemId");

-- AddForeignKey
ALTER TABLE "WrongBookAnalysis" ADD CONSTRAINT "WrongBookAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongBookAnalysis" ADD CONSTRAINT "WrongBookAnalysis_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongBookAnalysis" ADD CONSTRAINT "WrongBookAnalysis_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
