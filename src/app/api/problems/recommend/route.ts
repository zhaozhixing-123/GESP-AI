import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

/**
 * GET /api/problems/recommend?afterId=X
 * AC 当前题后推荐下一道：错题本 × 知识点弱项 × 同 level × 未 AC。
 * 算法：
 *  1. 错题本题目的 tag 出现次数 → 弱项排行
 *  2. 依次尝试每个弱项 tag：在当前 level 下找「含该 tag 且未 AC 且非当前题」的题
 *  3. 找不到就回落到同 level 第一道未 AC 题
 *  4. 全 AC 则建议升级
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const url = new URL(request.url);
  const afterIdStr = url.searchParams.get("afterId");
  if (!afterIdStr) return Response.json({ error: "缺少 afterId" }, { status: 400 });
  const afterId = parseInt(afterIdStr);
  if (isNaN(afterId)) return Response.json({ error: "无效 afterId" }, { status: 400 });

  try {
    const current = await prisma.problem.findUnique({
      where: { id: afterId },
      select: { id: true, level: true },
    });
    if (!current) return Response.json({ error: "题目不存在" }, { status: 404 });

    // 用户的 AC 集合
    const acSubs = await prisma.submission.findMany({
      where: { userId: user.userId, status: "AC" },
      select: { problemId: true },
      distinct: ["problemId"],
    });
    const acSet = new Set(acSubs.map((s) => s.problemId));

    // 错题本（仅真题，不含变形题）
    const wrong = await prisma.wrongBook.findMany({
      where: { userId: user.userId, problemId: { not: null } },
      select: { problem: { select: { tags: true } } },
    });

    // 统计 tag 弱项
    const tagCount: Record<string, number> = {};
    for (const w of wrong) {
      let tags: string[] = [];
      try { tags = JSON.parse(w.problem?.tags || "[]"); } catch {}
      for (const t of tags) tagCount[t] = (tagCount[t] || 0) + 1;
    }
    const weakTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).map(([t]) => t);

    // 同 level 的候选题
    const sameLevel = await prisma.problem.findMany({
      where: { level: current.level, id: { not: afterId } },
      select: { id: true, luoguId: true, title: true, level: true, tags: true },
      orderBy: { luoguId: "asc" },
    });

    // 按弱项 tag 依次尝试
    for (const tag of weakTags) {
      const hit = sameLevel.find((p) => {
        if (acSet.has(p.id)) return false;
        let pTags: string[] = [];
        try { pTags = JSON.parse(p.tags || "[]"); } catch {}
        return pTags.includes(tag);
      });
      if (hit) {
        return Response.json({
          problem: hit,
          reason: `你在『${tag}』上还有 ${tagCount[tag]} 道错题，这道巩固一下`,
        });
      }
    }

    // 回落：同 level 第一道未 AC 题
    const nextInLevel = sameLevel.find((p) => !acSet.has(p.id));
    if (nextInLevel) {
      return Response.json({
        problem: nextInLevel,
        reason: `${current.level} 级下一道未 AC 的题`,
      });
    }

    // 全 AC → 建议升级
    if (current.level < 8) {
      return Response.json({
        upgrade: current.level + 1,
        reason: `${current.level} 级题目都 AC 了，挑战 ${current.level + 1} 级？`,
      });
    }

    return Response.json({ reason: "全部 AC，你已是 GESP 8 级大佬！" });
  } catch {
    return Response.json({ error: "推荐下一题失败" }, { status: 500 });
  }
}
