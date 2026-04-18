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
 * 北极星面板接口：只输出两个 NS 指标 + 一个漏斗 + 一个目标级别分布。
 *
 * P1: 付费订阅用户数（B 口径 = 当下有效订阅，plan≠free 且 planExpireAt>now 且非内部账号）
 * P2: 本周付费用户中 AC≥1 道 distinct 题的人数（分母 = 当下 P1）
 * 漏斗: UV(distinct anonymousId) → 注册 → 首次提交 → 付费新增（均为本周新增）
 * 级别分布: targetLevel groupBy
 *
 * 所有统计都必须排除：role='admin'、isInternal=true。
 */

// 统一的"真实用户"过滤条件：排除 admin 和内部测试账号
const REAL_USER = { role: "user", isInternal: false } as const;

/** 统计某个时间窗内活跃付费订阅人数（按订阅快照计，非订单累计） */
async function paidCountAt(when: Date): Promise<number> {
  return prisma.user.count({
    where: {
      ...REAL_USER,
      plan: { not: "free" },
      planExpireAt: { gt: when },
    },
  });
}

/** 计算某个周内 AC≥1 道 distinct 题的付费用户数 */
async function paidActiveInWeek(weekStart: Date, weekEnd: Date): Promise<number> {
  // 周末时点为准：谁在周内是付费的，他们里谁在周内 AC 了任意一题
  const paidIds = await prisma.user.findMany({
    where: {
      ...REAL_USER,
      plan: { not: "free" },
      planExpireAt: { gt: weekStart },
    },
    select: { id: true },
  });
  if (paidIds.length === 0) return 0;

  const ids = paidIds.map((u) => u.id);
  const acUsers = await prisma.submission.findMany({
    where: {
      userId: { in: ids },
      status: "AC",
      createdAt: { gte: weekStart, lt: weekEnd },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  return acUsers.length;
}

/** P1/P2 核心指标 */
async function computeNorthStar() {
  const now = new Date();
  const { start: thisStart, end: thisEnd } = currentWeek(now);
  const { start: lastSameStart, end: lastSameEnd } = lastWeekSameProgress(now);
  const { start: lastFullStart, end: lastFullEnd } = lastWeek(now);

  // P1 当前值（B 口径：实时快照）
  const p1Current = await paidCountAt(now);

  // P1 四周滚动平均（取近 4 周每周起点时的付费快照均值）
  const rolling4 = last8WeekStarts(now).slice(-5, -1); // 最近 4 周起点（不含本周）
  const rollingCounts = await Promise.all(rolling4.map((d) => paidCountAt(d)));
  const p1Rolling4wAvg =
    rollingCounts.length > 0
      ? Math.round(rollingCounts.reduce((a, b) => a + b, 0) / rollingCounts.length)
      : 0;

  // P1 WoW：用 "本周至今" 与 "上周同期" 的快照对比
  // 快照取时点 = thisEnd 当前即 now / lastSameEnd
  const p1LastSame = await paidCountAt(lastSameEnd);
  const p1WowDelta = p1Current - p1LastSame;
  const p1WowPct = p1LastSame > 0 ? (p1WowDelta / p1LastSame) * 100 : null;

  // P2 本周（分母 = P1）
  const p2Active = await paidActiveInWeek(thisStart, thisEnd);
  const p2Ratio = p1Current > 0 ? p2Active / p1Current : 0;

  // P2 WoW 同期：上周同期时点的付费人群里，上周同期时段内 AC≥1 的人数
  const p2LastSame = await paidActiveInWeek(lastSameStart, lastSameEnd);
  const p2WowDelta = p2Active - p2LastSame;

  // P2 四周滚动平均（每周完整周：本周之前 4 个完整周）
  const pastWeekStarts = last8WeekStarts(now).slice(-5, -1);
  const p2Past = await Promise.all(
    pastWeekStarts.map((ws) => paidActiveInWeek(ws, nextWeekStart(ws))),
  );
  const p2Rolling4wAvg =
    p2Past.length > 0 ? Math.round(p2Past.reduce((a, b) => a + b, 0) / p2Past.length) : 0;

  // 上周完整周 P2（给 UI 展示 "上周最终值" 作为对比基线）
  const p2LastFull = await paidActiveInWeek(lastFullStart, lastFullEnd);

  return {
    p1: {
      current: p1Current,
      target: 100,
      rolling4wAvg: p1Rolling4wAvg,
      wow: {
        lastSame: p1LastSame,
        delta: p1WowDelta,
        deltaPct: p1WowPct,
      },
    },
    p2: {
      active: p2Active,
      denominator: p1Current,
      ratio: p2Ratio,
      lastFullWeek: p2LastFull,
      rolling4wAvg: p2Rolling4wAvg,
      wow: {
        lastSame: p2LastSame,
        delta: p2WowDelta,
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

/** 拉新→付费漏斗：UV → 注册 → 首次提交 → 付费（本周新增） */
async function computeFunnel() {
  const now = new Date();
  const { start, end } = currentWeek(now);
  const { start: lastStart, end: lastSameEnd } = lastWeekSameProgress(now);

  async function funnelFor(ws: Date, we: Date) {
    // UV: 去重 anonymousId 的 page_view；排除已登录用户里标记 internal 的那些事件
    const uvRows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT e."anonymousId")::int AS count
      FROM "Event" e
      LEFT JOIN "User" u ON u.id = e."userId"
      WHERE e.type = 'page_view'
        AND e."createdAt" >= ${ws} AND e."createdAt" < ${we}
        AND (u.id IS NULL OR (u."isInternal" = false AND u.role <> 'admin'))`;
    const uv = uvRows[0]?.count ?? 0;

    // 注册：本周新建的真实用户
    const signup = await prisma.user.count({
      where: { ...REAL_USER, createdAt: { gte: ws, lt: we } },
    });

    // 首次提交：首次提交的 createdAt 落在本周的真实用户数
    const firstSubRows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM (
        SELECT s."userId", MIN(s."createdAt") AS first_at
        FROM "Submission" s
        JOIN "User" u ON u.id = s."userId"
        WHERE u."isInternal" = false AND u.role = 'user'
        GROUP BY s."userId"
      ) t
      WHERE t.first_at >= ${ws} AND t.first_at < ${we}`;
    const firstSubmit = firstSubRows[0]?.count ?? 0;

    // 付费新增：本周支付成功的 paid 订单中 distinct 用户（排除内部）
    const paidRows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT o."userId")::int AS count
      FROM "Order" o
      JOIN "User" u ON u.id = o."userId"
      WHERE o.status = 'paid'
        AND o."paidAt" >= ${ws} AND o."paidAt" < ${we}
        AND u."isInternal" = false AND u.role = 'user'`;
    const paid = paidRows[0]?.count ?? 0;

    return { uv, signup, firstSubmit, paid };
  }

  const [thisWeek, lastSame] = await Promise.all([
    funnelFor(start, end),
    funnelFor(lastStart, lastSameEnd),
  ]);

  return {
    thisWeek,
    lastSame,
  };
}

/** 目标级别分布（1-8 或 null/未填） */
async function computeLevelDistribution() {
  const rows = await prisma.user.groupBy({
    by: ["targetLevel"],
    where: REAL_USER,
    _count: { id: true },
    orderBy: { targetLevel: "asc" },
  });
  return rows.map((r) => ({
    level: r.targetLevel, // null = 未填
    count: r._count.id,
  }));
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
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[Dashboard API]", msg);
    return Response.json({ error: "数据加载失败" }, { status: 500 });
  }
}
