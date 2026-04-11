import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fetchLuoguProblem } from "@/lib/luogu";

/**
 * POST /api/admin/problems/retag
 * 批量回填所有 tags 为 "[]" 的题目的算法标签
 * 支持传 { all: true } 强制更新全部题目
 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const forceAll = body.all === true;

  const problems = await prisma.problem.findMany({
    where: forceAll ? undefined : { tags: "[]" },
    select: { id: true, luoguId: true },
  });

  if (problems.length === 0) {
    return Response.json({ message: "所有题目已有标签，无需回填" });
  }

  const results: Array<{ luoguId: string; tags: string[]; status: "ok" | "error"; error?: string }> = [];

  for (let i = 0; i < problems.length; i++) {
    const { id, luoguId } = problems[i];
    console.log(`[retag] ${i + 1}/${problems.length}: ${luoguId}`);
    try {
      const data = await fetchLuoguProblem(luoguId);
      await prisma.problem.update({ where: { id }, data: { tags: data.tags } });
      results.push({ luoguId, tags: JSON.parse(data.tags), status: "ok" });
    } catch (e: any) {
      console.error(`[retag] ${luoguId} 失败:`, e.message);
      results.push({ luoguId, tags: [], status: "error", error: e.message });
    }
    if (i < problems.length - 1) {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  const successCount = results.filter((r) => r.status === "ok").length;
  const failCount = results.filter((r) => r.status === "error").length;

  return Response.json({
    message: `回填完成：成功 ${successCount}，失败 ${failCount}，共 ${problems.length} 题`,
    success: successCount,
    failed: failCount,
    results,
  });
}
