import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentWeek } from "@/lib/weekRange";

/**
 * 下钻：本周未 AC 任意一题的付费用户。
 *
 * 给运营区分 4 种情况（决定沟通话术）：
 *   - neverSubmitted:  从未提交，多半是买了没用 → 新手引导
 *   - struggling:      本周有提交但都 WA/CE/TLE → AI 私教/错因分析介入
 *   - drifted:         有访问但本周没提交 → 拉回做题
 *   - absent:          本周没访问过 → 流失警告，直接联系
 *
 * "付费用户"判定：本周内任一时刻处于付费状态（含周内新增付费 + 周初已付费）
 */

type Bucket = "neverSubmitted" | "struggling" | "drifted" | "absent";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const now = new Date();
    const { start, end } = currentWeek(now);

    // 本周时点的付费真实用户（周初已付费 + 周内新付费）
    const [subbed, newlyPaid] = await Promise.all([
      prisma.user.findMany({
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
        },
      }),
      prisma.$queryRaw<{ userId: number }[]>`
        SELECT DISTINCT o."userId"
        FROM "Order" o
        JOIN "User" u ON u.id = o."userId"
        WHERE o.status = 'paid'
          AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
          AND u."isInternal" = false AND u.role = 'user'`,
    ]);

    const subbedIds = new Set(subbed.map((u) => u.id));
    const extraIds = newlyPaid.map((r) => r.userId).filter((id) => !subbedIds.has(id));
    const extra =
      extraIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: extraIds } },
            select: {
              id: true,
              email: true,
              nickname: true,
              plan: true,
              planExpireAt: true,
              targetLevel: true,
              createdAt: true,
            },
          })
        : [];
    const paid = [...subbed, ...extra];

    if (paid.length === 0) {
      return Response.json({ users: [], counts: empty(), window: windowIso(start, end) });
    }

    const ids = paid.map((u) => u.id);

    // 本周 AC 过任意题的付费用户
    const acRows = await prisma.submission.findMany({
      where: { userId: { in: ids }, status: "AC", createdAt: { gte: start, lt: end } },
      select: { userId: true },
      distinct: ["userId"],
    });
    const acSet = new Set(acRows.map((r) => r.userId));

    // 每人本周所有提交状态（用于区分 struggling / drifted）
    const weekSubmissions = await prisma.submission.findMany({
      where: { userId: { in: ids }, createdAt: { gte: start, lt: end } },
      select: { userId: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const weekSubsByUser = new Map<number, { status: string; createdAt: Date }[]>();
    for (const s of weekSubmissions) {
      if (!weekSubsByUser.has(s.userId)) weekSubsByUser.set(s.userId, []);
      weekSubsByUser.get(s.userId)!.push(s);
    }

    // 每人历史最后一次提交（不限周内）
    const lastSubRows = await prisma.$queryRaw<
      { userId: number; last_at: Date; last_status: string }[]
    >`
      SELECT DISTINCT ON ("userId") "userId", "createdAt" AS last_at, status AS last_status
      FROM "Submission"
      WHERE "userId" = ANY(${ids}::int[])
      ORDER BY "userId", "createdAt" DESC`;
    const lastSubMap = new Map(
      lastSubRows.map((r) => [r.userId, { at: r.last_at, status: r.last_status }]),
    );

    // 每人本周最后一次 page_view（任何页面），用于区分 drifted / absent
    const lastViewRows = await prisma.$queryRaw<{ userId: number; last_at: Date }[]>`
      SELECT "userId", MAX("createdAt") AS last_at
      FROM "Event"
      WHERE "userId" = ANY(${ids}::int[])
        AND "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY "userId"`;
    const lastViewMap = new Map(lastViewRows.map((r) => [r.userId, r.last_at]));

    function bucketOf(uid: number): Bucket {
      const weekSubs = weekSubsByUser.get(uid);
      if (!weekSubs || weekSubs.length === 0) {
        // 本周无提交
        return lastSubMap.has(uid)
          ? lastViewMap.has(uid)
            ? "drifted" // 以前提交过，本周访问过但没提交
            : "absent" // 以前提交过，本周没来
          : "neverSubmitted"; // 从没提交过
      }
      // 本周有提交但都不是 AC（因为他在 silent 列表里）
      return "struggling";
    }

    const silent = paid
      .filter((u) => !acSet.has(u.id))
      .map((u) => {
        const last = lastSubMap.get(u.id) ?? null;
        return {
          id: u.id,
          email: u.email,
          nickname: u.nickname,
          plan: u.plan,
          planExpireAt: u.planExpireAt,
          targetLevel: u.targetLevel,
          joinedAt: u.createdAt,
          lastSubmissionAt: last?.at ?? null,
          lastSubmissionStatus: last?.status ?? null,
          lastVisitedThisWeekAt: lastViewMap.get(u.id) ?? null,
          weekAttempts: weekSubsByUser.get(u.id)?.length ?? 0,
          bucket: bucketOf(u.id),
        };
      })
      .sort((a, b) => {
        // 排序：struggling（最可救援）→ drifted → absent → neverSubmitted
        const order: Record<Bucket, number> = {
          struggling: 0,
          drifted: 1,
          absent: 2,
          neverSubmitted: 3,
        };
        return order[a.bucket] - order[b.bucket];
      });

    const counts: Record<Bucket, number> = {
      neverSubmitted: 0,
      struggling: 0,
      drifted: 0,
      absent: 0,
    };
    for (const s of silent) counts[s.bucket]++;

    return Response.json({
      users: silent,
      counts,
      window: windowIso(start, end),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[PaidSilent API]", msg);
    return Response.json({ error: "查询失败" }, { status: 500 });
  }
}

function empty(): Record<Bucket, number> {
  return { neverSubmitted: 0, struggling: 0, drifted: 0, absent: 0 };
}

function windowIso(start: Date, end: Date) {
  return { start: start.toISOString(), end: end.toISOString() };
}
