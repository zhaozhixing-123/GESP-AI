-- Security fixes 2026-04-18:
-- A1: 服务端基于 DailyFocusLog 增量计算通知，记录上次通知点
-- B1: tokenVersion 机制，改密时递增使旧 JWT 失效

ALTER TABLE "User"
  ADD COLUMN "lastNotifyFocusMs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastNotifyDistractMs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
