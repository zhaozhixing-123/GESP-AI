import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentWeek } from "@/lib/weekRange";

/**
 * 下钻：本周未 AC 任意一题的付费用户列表。
 * 运营按此列表逐个联系，是 P2 指标的直接抓手。
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const now = new Date();
    const { start, end } = currentWeek(now);

    // 本周时点的付费真实用户
    const paid = await prisma.user.findMany({
      where: {
        role: "user",
        isInternal: false,
        plan: { not: "free" },
        planExpireAt: { gt: start },
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        plan: true,
        planExpireAt: true,
        targetLevel: true,
        createdAt: true,
        phone: true,
      },
      orderBy: { planExpireAt: "asc" },
    });

    if (paid.length === 0) {
      return Response.json({ users: [] });
    }

    const ids = paid.map((u) => u.id);

    // 本周 AC 过任意题的付费用户集合
    const acUsers = await prisma.submission.findMany({
      where: {
        userId: { in: ids },
        status: "AC",
        createdAt: { gte: start, lt: end },
      },
      select: { userId: true },
      distinct: ["userId"],
    });
    const acSet = new Set(acUsers.map((r) => r.userId));

    // 再取每人最近一次提交（不限状态）和最近一次 AC，给运营判断断层原因
    const lastSubmissions = await prisma.$queryRaw<
      { userId: number; last_at: Date }[]
    >`
      SELECT "userId", MAX("createdAt") AS last_at
      FROM "Submission"
      WHERE "userId" = ANY(${ids}::int[])
      GROUP BY "userId"`;
    const lastMap = new Map(lastSubmissions.map((r) => [r.userId, r.last_at]));

    const silent = paid
      .filter((u) => !acSet.has(u.id))
      .map((u) => ({
        id: u.id,
        email: u.email,
        nickname: u.nickname,
        plan: u.plan,
        planExpireAt: u.planExpireAt,
        targetLevel: u.targetLevel,
        phone: u.phone,
        joinedAt: u.createdAt,
        lastSubmissionAt: lastMap.get(u.id) ?? null,
      }));

    return Response.json({
      users: silent,
      window: { start: start.toISOString(), end: end.toISOString() },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[PaidSilent API]", msg);
    return Response.json({ error: "查询失败" }, { status: 500 });
  }
}
