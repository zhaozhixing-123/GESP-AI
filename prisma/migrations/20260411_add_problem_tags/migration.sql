-- AlterTable: 给 Problem 表添加 tags 字段
ALTER TABLE "Problem" ADD COLUMN IF NOT EXISTS "tags" TEXT NOT NULL DEFAULT '[]';
