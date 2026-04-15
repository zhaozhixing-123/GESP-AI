-- Security fixes: 2026-04-15

-- C2: Add attempts counter to VerificationCode for brute-force protection
ALTER TABLE "VerificationCode" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
