import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { getSubscriptionInfo } from "@/lib/subscription";

/**
 * GET /api/variants?sourceId=X
 * 返回某源题下该用户已解锁的变形题列表（用于做题页 WA 后提示巩固入口）。
 * 批次判定：按 VariantProblem.createdAt 升序，前 2 道 = batch 1，后续 = batch 2。
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const url = new URL(request.url);
  const sourceIdStr = url.searchParams.get("sourceId");
  if (!sourceIdStr) return Response.json({ error: "缺少 sourceId" }, { status: 400 });
  const sourceId = parseInt(sourceIdStr);
  if (isNaN(sourceId)) return Response.json({ error: "无效 sourceId" }, { status: 400 });

  try {
    const allVariants = await prisma.variantProblem.findMany({
      where: { sourceId, genStatus: "ready" },
      select: { id: true, title: true, level: true },
      orderBy: { createdAt: "asc" },
    });

    const unlocks = await prisma.variantUnlock.findMany({
      where: { userId: user.userId, problemId: sourceId },
      select: { batch: true },
    });
    const unlockedBatchSet = new Set(unlocks.map((u) => u.batch));

    const isAdmin = user.role === "admin";
    const sub = await getSubscriptionInfo(user.userId);

    // admin 视为全部解锁；其他用户按 VariantUnlock
    const unlockedVariants = allVariants
      .map((v, idx) => ({
        id: v.id,
        title: v.title,
        level: v.level,
        batch: idx < 2 ? 1 : 2,
      }))
      .filter((v) => isAdmin || unlockedBatchSet.has(v.batch));

    return Response.json({
      sourceId,
      hasAny: allVariants.length > 0,
      totalVariants: allVariants.length,
      unlockedVariants,
      isPaid: sub.isPaid,
    });
  } catch {
    return Response.json({ error: "获取变形题失败" }, { status: 500 });
  }
}
