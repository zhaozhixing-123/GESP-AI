import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

/** GET /api/wrongbook — 获取当前用户的错题本列表（含掌握状态） */
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  try {
    const entries = await prisma.wrongBook.findMany({
      where: { userId: user.userId },
      orderBy: { addedAt: "desc" },
      include: {
        problem: {
          select: { id: true, luoguId: true, title: true, level: true },
        },
      },
    });

    // 批量查询每道题是否在加入错题本之后有 AC 提交
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const acAfter = await prisma.submission.findFirst({
          where: {
            userId: user.userId,
            problemId: entry.problemId,
            status: "AC",
            createdAt: { gte: entry.addedAt },
          },
          select: { id: true },
        });
        return { ...entry, mastered: !!acAfter };
      })
    );

    return Response.json({ entries: enriched });
  } catch {
    return Response.json({ error: "获取错题本失败" }, { status: 500 });
  }
}

/** POST /api/wrongbook — 手动将题目加入错题本 */
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  try {
    const { problemId } = await request.json();
    if (!problemId) return Response.json({ error: "缺少 problemId" }, { status: 400 });

    await prisma.wrongBook.upsert({
      where: {
        userId_problemId: { userId: user.userId, problemId: parseInt(problemId) },
      },
      update: {},
      create: { userId: user.userId, problemId: parseInt(problemId) },
    });

    return Response.json({ added: true });
  } catch {
    return Response.json({ error: "添加失败" }, { status: 500 });
  }
}
