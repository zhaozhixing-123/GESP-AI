import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    // 二次确认：防止误操作或 token 泄露后被恶意调用
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== "DELETE_ALL_PROBLEMS") {
      return Response.json(
        { error: "请传入 confirm: 'DELETE_ALL_PROBLEMS' 以确认此危险操作" },
        { status: 400 }
      );
    }

    // 先删除关联数据
    await prisma.chatHistory.deleteMany({});
    await prisma.wrongBook.deleteMany({});
    await prisma.submission.deleteMany({});
    await prisma.problem.deleteMany({});

    return Response.json({ message: "已清空所有题目及相关数据" });
  } catch (e: any) {
    console.error("[Clear]", e?.message ?? "unknown error");
    return Response.json({ error: "清空失败: " + (e?.message ?? "unknown error") }, { status: 500 });
  }
}
