import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function DELETE(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    // 先删除关联数据
    await prisma.chatHistory.deleteMany({});
    await prisma.wrongBook.deleteMany({});
    await prisma.submission.deleteMany({});
    await prisma.problem.deleteMany({});

    return Response.json({ message: "已清空所有题目及相关数据" });
  } catch (e: any) {
    console.error("Clear error:", e);
    return Response.json({ error: "清空失败: " + e.message }, { status: 500 });
  }
}
