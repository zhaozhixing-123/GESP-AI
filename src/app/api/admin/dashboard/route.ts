import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  currentWeek,
  lastWeek,
  lastWeekSameProgress,
  last8WeekStarts,
  nextWeekStart,
} from "@/lib/weekRange";

/**
 * 北极星面板接口：只输出 P1 / P2 + 队列漏斗 + 级别分布（付费 vs 免费）。
 *
 * P1: 付费订阅人数（B 口径 = 当下快照）
 * P2: 本周内"在付费状态且 AC≥1 道 distinct 题"的人数；分母 = P2 cohort 总数
 * 漏斗: cohort 型，以首次 page_view 在窗口内的 anonymousId 为锚，追踪他们
 *       注册 → 提交 → 付费（任意后续时间完成都算）
 * 级别分布: 真实用户的 targetLevel 分布，按付费/免费拆分
 *
 * 所有统计排除 role='admin'、isInternal=true。
 */

const P1_TARGET = parseInt(process.env.NORTH_STAR_P1_TARGET ?? "100");
const REAL_USER = { role: "user", isInternal: false } as const;

/** 当前时点 B 口径付费人数 */
async function paidCountAt(when: Date): Promise<number> {
  return prisma.user.count({
    where: {
      ...REAL_USER,
      plan: { not: "free" },
      planExpireAt: { gt: when },
    },
  });
}

/**
 * "某周内为付费用户"口径：周内任一时刻处于付费状态。
 * = 周末之前已付费（planExpireAt > weekStart 表示周初尚未过期）
 *   或 周内产生了 paid 订单（新增付费）。
 */
async function paidUserIdsInWindow(weekStart: Date, weekEnd: Date): Promise<number[]> {
  const [subbed, newlyPaid] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...REAL_USER,
        plan: { not: "free" },
        planExpireAt: { gt: weekStart },
      },
      select: { id: true },
    }),
    prisma.$queryRaw<{ userId: number }[]>`
      SELECT DISTINCT o."userId"
      FROM "Order" o
      JOIN "User" u ON u.id = o."userId"
      WHERE o.status = 'paid'
        AND o."paidAt" >= ${weekStart} AND o."paidAt" < ${weekEnd}
        AND u."isInternal" = false AND u.role = 'user'`,
  ]);
  const set = new Set<number>(subbed.map((u) => u.id));
  for (const r of newlyPaid) set.add(r.userId);
  return Array.from(set);
}

/** 给定付费用户集合 + 时间窗，返回其中 AC≥1 distinct 题的人数 */
async function paidAcCount(ids: number[], weekStart: Date, weekEnd: Date): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await prisma.submission.findMany({
    where: {
      userId: { in: ids },
      status: "AC",
      createdAt: { gte: weekStart, lt: weekEnd },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.length;
}

/** 某周 P2 = { active, denominator, ratio } */
async function p2For(weekStart: Date, weekEnd: Date) {
  const ids = await paidUserIdsInWindow(weekStart, weekEnd);
  const active = await paidAcCount(ids, weekStart, weekEnd);
  return {
    active,
    denominator: ids.length,
    ratio: ids.length > 0 ? active / ids.length : 0,
  };
}

/** P1 + P2 指标 */
async function computeNorthStar() {
  const now = new Date();
  const { start: thisStart, end: thisEnd } = currentWeek(now);
  const { start: lastSameStart, end: lastSameEnd } = lastWeekSameProgress(now);
  const { start: lastFullStart, end: lastFullEnd } = lastWeek(now);

  // P1 当前值
  const p1Current = await paidCountAt(now);

  // P1 WoW（快照对比）
  const p1LastSame = await paidCountAt(lastSameEnd);
  const p1WowDelta = p1Current - p1LastSame;
  const p1WowPct = p1LastSame > 0 ? (p1WowDelta / p1LastSame) * 100 : null;

  // P1 4 周净增 = 当前值 - 4 周前周一时点值
  const weekStarts = last8WeekStarts(now);
  const fourWeeksAgo = weekStarts[weekStarts.length - 5]; // 本周之前第 4 周的周一
  const p1FourWeeksAgo = await paidCountAt(fourWeeksAgo);
  const p1Net4w = p1Current - p1FourWeeksAgo;

  // P2 本周 / 上周同期 / 上周完整周
  const [p2This, p2LastSame, p2LastFull] = await Promise.all([
    p2For(thisStart, thisEnd),
    p2For(lastSameStart, lastSameEnd),
    p2For(lastFullStart, lastFullEnd),
  ]);

  // P2 4 周滚动：近 4 个完整周的 ratio 均值（比例均值，不是绝对数）
  const pastStarts = weekStarts.slice(-5, -1); // 最近 4 个已完成的完整周起点
  const pastRatios = await Promise.all(
    pastStarts.map(async (ws) => {
      const we = nextWeekStart(ws);
      const p = await p2For(ws, we);
      return p.ratio;
    }),
  );
  const p2Rolling4wRatio =
    pastRatios.length > 0 ? pastRatios.reduce((a, b) => a + b, 0) / pastRatios.length : 0;

  return {
    p1: {
      current: p1Current,
      target: P1_TARGET,
      net4w: p1Net4w,
      wow: { lastSame: p1LastSame, delta: p1WowDelta, deltaPct: p1WowPct },
    },
    p2: {
      thisWeek: p2This,
      lastFullWeek: p2LastFull,
      rolling4wRatio: p2Rolling4wRatio,
      wow: {
        lastSame: p2LastSame,
        delta: p2This.active - p2LastSame.active,
      },
    },
    window: {
      weekStart: thisStart.toISOString(),
      weekEnd: thisEnd.toISOString(),
      lastSameStart: lastSameStart.toISOString(),
      lastSameEnd: lastSameEnd.toISOString(),
    },
  };
}

/**
 * 队列型漏斗：以首次 page_view 落在 [cohortStart, cohortEnd) 的 anonymousId
 * 为锚，追踪他们的注册/提交/付费（maturityEnd 之前完成的才算）。
 *
 * maturityEnd 是"观测截止点"，保证本周 cohort 和上周同期 cohort 有同等观测
 * 长度（都是窗口从起点到 maturityEnd-cohortStart 这么长）。
 */
async function cohortFunnel(cohortStart: Date, cohortEnd: Date, maturityEnd: Date) {
  // Step 1: 首次 page_view 在窗口内的 anonymousId
  //   用 MIN(createdAt) 算"首次"，只有 first >= cohortStart 且 < cohortEnd 才算本 cohort
  //   排除 internal/admin 的已登录访问事件（匿名访问无法判断，只能保留）
  const cohortRows = await prisma.$queryRaw<{ anonymousId: string }[]>`
    WITH first_seen AS (
      SELECT e."anonymousId", MIN(e."createdAt") AS first_at
      FROM "Event" e
      LEFT JOIN "User" u ON u.id = e."userId"
      WHERE e.type = 'page_view'
        AND (u.id IS NULL OR (u."isInternal" = false AND u.role <> 'admin'))
      GROUP BY e."anonymousId"
    )
    SELECT "anonymousId" FROM first_seen
    WHERE first_at >= ${cohortStart} AND first_at < ${cohortEnd}`;

  const uv = cohortRows.length;
  if (uv === 0) {
    return { uv: 0, signup: 0, firstSubmit: 0, paid: 0 };
  }

  const anonIds = cohortRows.map((r) => r.anonymousId);

  // Step 2: 该 cohort 的 anonymousId 里，在 maturityEnd 之前注册成真实用户的
  //   依赖 signup_submit（或任何登录态 event）把 anonymousId 与 userId 串起来
  const linkedUsers = await prisma.$queryRaw<{ userId: number; createdAt: Date }[]>`
    SELECT DISTINCT ON (e."anonymousId") e."userId", u."createdAt"
    FROM "Event" e
    JOIN "User" u ON u.id = e."userId"
    WHERE e."anonymousId" = ANY(${anonIds}::text[])
      AND e."userId" IS NOT NULL
      AND u."isInternal" = false AND u.role = 'user'
      AND u."createdAt" < ${maturityEnd}
    ORDER BY e."anonymousId", u."createdAt" ASC`;

  const signup = linkedUsers.length;
  if (signup === 0) {
    return { uv, signup: 0, firstSubmit: 0, paid: 0 };
  }

  const userIds = linkedUsers.map((r) => r.userId);

  // Step 3: 这些用户在 maturityEnd 之前有任何提交
  const submitted = await prisma.submission.findMany({
    where: { userId: { in: userIds }, createdAt: { lt: maturityEnd } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const firstSubmit = submitted.length;

  // Step 4: 这些用户在 maturityEnd 之前有 paid 订单
  const paidRows = await prisma.order.findMany({
    where: {
      userId: { in: userIds },
      status: "paid",
      paidAt: { not: null, lt: maturityEnd },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  return { uv, signup, firstSubmit, paid: paidRows.length };
}

async function computeFunnel() {
  const now = new Date();
  const { start: thisStart, end: thisEnd } = currentWeek(now);
  const { start: lastSameStart, end: lastSameEnd } = lastWeekSameProgress(now);

  // 近 4 周成熟 cohort：[4 周前周一, 本周一) 的新 UV，观测到现在
  const weekStarts = last8WeekStarts(now);
  const fourWeeksStart = weekStarts[weekStarts.length - 5];

  const [thisWeek, lastSame, rolling4w] = await Promise.all([
    // 本周 cohort，观测到现在（maturity = 本周至今）
    cohortFunnel(thisStart, thisEnd, now),
    // 上周同期 cohort，观测到上周同期时点（同等成熟度对比）
    cohortFunnel(lastSameStart, lastSameEnd, lastSameEnd),
    // 近 4 周 cohort（本周之前 4 个完整周），观测到现在（至少 1 周成熟度）
    cohortFunnel(fourWeeksStart, thisStart, now),
  ]);

  return { thisWeek, lastSame, rolling4w };
}

/** 级别分布：付费 vs 免费两组 */
async function computeLevelDistribution() {
  const now = new Date();
  const rows = await prisma.user.findMany({
    where: REAL_USER,
    select: { targetLevel: true, plan: true, planExpireAt: true },
  });
  const isPaid = (u: { plan: string; planExpireAt: Date | null }) =>
    u.plan !== "free" && u.planExpireAt !== null && u.planExpireAt > now;

  const buckets = new Map<number | "none", { paid: number; free: number }>();
  const touch = (k: number | "none") => {
    if (!buckets.has(k)) buckets.set(k, { paid: 0, free: 0 });
    return buckets.get(k)!;
  };
  for (const u of rows) {
    const key = u.targetLevel ?? "none";
    const slot = touch(key);
    if (isPaid(u)) slot.paid++;
    else slot.free++;
  }
  return Array.from(buckets.entries())
    .map(([level, v]) => ({
      level: level === "none" ? null : (level as number),
      paid: v.paid,
      free: v.free,
    }))
    .sort((a, b) => {
      if (a.level === null) return 1;
      if (b.level === null) return -1;
      return a.level - b.level;
    });
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const [northStar, funnel, levelDistribution] = await Promise.all([
      computeNorthStar(),
      computeFunnel(),
      computeLevelDistribution(),
    ]);

    return Response.json(
      { northStar, funnel, levelDistribution },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[Dashboard API]", msg);
    return Response.json({ error: "数据加载失败" }, { status: 500 });
  }
}
