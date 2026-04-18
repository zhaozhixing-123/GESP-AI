-- 再复核：非破坏性复核报告字段（不修改 testCases）
-- reviewReport 存 JSON：{ reviewedAt, model, total, passed, failed, issues: [{index,input,expectedOutput,opusOutput,status,...}] }
-- lastReviewedAt 区别于旧 verifiedAt（verifiedAt 是"复核并删除"时间戳）

ALTER TABLE "Problem" ADD COLUMN "reviewReport" TEXT;
ALTER TABLE "Problem" ADD COLUMN "lastReviewedAt" TIMESTAMP(3);

ALTER TABLE "VariantProblem" ADD COLUMN "reviewReport" TEXT;
ALTER TABLE "VariantProblem" ADD COLUMN "lastReviewedAt" TIMESTAMP(3);
