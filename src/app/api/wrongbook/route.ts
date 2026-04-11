import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

/** GET /api/wrongbook — 获取当前用户的错题本列表（含掌握状态和 AI 分析） */
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  try {
    const [entries, acSubmissions, analyses] = await Promise.all([
      prisma.wrongBook.findMany({
        where: { userId: user.userId },
        orderBy: { addedAt: "desc" },
        include: {
          problem: {
            select: { id: true, luoguId: true, title: true, level: true, tags: true },
          },
        },
      }),
      // 批量拉取该用户所有 AC 提交，避免 N+1
      prisma.submission.findMany({
        where: { userId: user.userId, status: "AC" },
        select: { problemId: true, createdAt: true },
      }),
      // 批量拉取已保存的 AI 分析
      prisma.wrongBookAnalysis.findMany({
        where: { userId: user.userId },
        select: { problemId: true, content: true, errorType: true, submissionId: true },
      }),
    ]);

    // 按 problemId 归组 AC 提交时间列表
    const acMap = new Map<number, Date[]>();
    for (const s of acSubmissions) {
      const arr = acMap.get(s.problemId) ?? [];
      arr.push(s.createdAt);
      acMap.set(s.problemId, arr);
    }

    // 按 problemId 索引分析记录
    const analysisMap = new Map(analyses.map((a) => [a.problemId, a]));

    const enriched = entries.map((entry) => {
      const mastered = (acMap.get(entry.problemId) ?? []).some(
        (t) => t >= entry.addedAt
      );
      const analysis = analysisMap.get(entry.problemId) ?? null;
      return { ...entry, mastered, analysis };
    });

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
