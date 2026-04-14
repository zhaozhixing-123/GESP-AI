-- 1. 重命名 username → nickname
ALTER TABLE "User" RENAME COLUMN "username" TO "nickname";

-- 2. 去掉 nickname 的 unique 约束（原 username unique）
DROP INDEX IF EXISTS "User_username_key";

-- 3. 新增 email 字段（先允许 null，填充后再加约束）
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- 4. 管理员账号设置真实邮箱，其余用户用占位邮箱
UPDATE "User" SET "email" = 'momoai20251210@gmail.com', "emailVerified" = true WHERE "role" = 'admin' AND "email" IS NULL;
UPDATE "User" SET "email" = "nickname" || '@placeholder.local' WHERE "email" IS NULL;

-- 5. 设置 email 为 NOT NULL + UNIQUE
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- 6. 新增 VerificationCode 表
CREATE TABLE "VerificationCode" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VerificationCode_email_type_idx" ON "VerificationCode"("email", "type");
