import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

/**
 * GET /api/user/tag-stats?tags=递归,DP
 * 返回当前用户在指定知识点上的 AC/总题数（用于做题页的 tag 进度 badge）
 * Problem.tags 是 JSON 字符串，无法 SQL 直接筛，所以一次拉全部在内存里归类。
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const url = new URL(request.url);
  const tagsParam = url.searchParams.get("tags") || "";
  const tagsList = tagsParam.split(",").map((t) => t.trim()).filter(Boolean);
  if (tagsList.length === 0) return Response.json({ stats: {} });

  try {
    const [allProblems, acSubs] = await Promise.all([
      prisma.problem.findMany({ select: { id: true, tags: true } }),
      prisma.submission.findMany({
        where: { userId: user.userId, status: "AC" },
        select: { problemId: true },
        distinct: ["problemId"],
      }),
    ]);

    const acSet = new Set(acSubs.map((s) => s.problemId));

    const stats: Record<string, { ac: number; total: number }> = {};
    for (const tag of tagsList) stats[tag] = { ac: 0, total: 0 };

    for (const p of allProblems) {
      let pTags: string[] = [];
      try { pTags = JSON.parse(p.tags || "[]"); } catch {}
      for (const tag of tagsList) {
        if (pTags.includes(tag)) {
          stats[tag].total++;
          if (acSet.has(p.id)) stats[tag].ac++;
        }
      }
    }

    return Response.json({ stats });
  } catch {
    return Response.json({ error: "获取知识点统计失败" }, { status: 500 });
  }
}
