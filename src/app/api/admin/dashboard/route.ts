import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { daysAgo } from "@/lib/weekRange";

/**
 * 基础数据面板接口。
 *
 * 核心指标（昨日 / 过去 7 天 / 历史累计）：
 *   - 注册用户数：createdAt 落入窗口的真实用户
 *   - 付费用户数：paidAt 落入窗口的 distinct 付费用户
 *   - 自学用户数：上述付费用户中曾 AC 过任一题
 *   - 付费转化率 = 付费 / 注册；自学转化率 = 自学 / 付费
 *
 * 订阅类型分布（当前时点快照）：monthly / quarterly / yearly + internal 赠阅
 * 目标级别分布：1–8 + 未填
 *
 * 口径：全部排除 role='admin'、isInternal=true（内部赠阅数除外，用于独立展示）。
 */

/** 昨日 CST：[昨天 00:00, 今天 00:00) */
function yesterdayRange(now: Date = new Date()): { start: Date; end: Date } {
  const CST = 8 * 60 * 60 * 1000;
  const cst = new Date(now.getTime() + CST);
  const todayStartCst = new Date(cst);
  todayStartCst.setUTCHours(0, 0, 0, 0);
  const todayStart = new Date(todayStartCst.getTime() - CST);
  const yStart = new Date(todayStart);
  yStart.setUTCDate(yStart.getUTCDate() - 1);
  return { start: yStart, end: todayStart };
}

/** 注册用户数：期内 createdAt 落在窗口的真实用户 */
async function registeredInRange(start: Date | null, end: Date | null): Promise<number> {
  const where: {
    role: string;
    isInternal: boolean;
    createdAt?: { gte?: Date; lt?: Date };
  } = { role: "user", isInternal: false };
  if (start || end) {
    where.createdAt = {};
    if (start) where.createdAt.gte = start;
    if (end) where.createdAt.lt = end;
  }
  return prisma.user.count({ where });
}

/** 付费用户数：期内 paid 订单的 distinct 用户（排除内部/管理员） */
async function paidInRange(start: Date | null, end: Date | null): Promise<number> {
  let rows: { c: bigint }[];
  if (start && end) {
    rows = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(DISTINCT o."userId")::bigint AS c
      FROM "Order" o
      JOIN "User" u ON u.id = o."userId"
      WHERE o.status = 'paid'
        AND u."isInternal" = false AND u.role = 'user'
        AND o."paidAt" >= ${start} AND o."paidAt" < ${end}`;
  } else {
    rows = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(DISTINCT o."userId")::bigint AS c
      FROM "Order" o
      JOIN "User" u ON u.id = o."userId"
      WHERE o.status = 'paid'
        AND u."isInternal" = false AND u.role = 'user'`;
  }
  return Number(rows[0]?.c ?? 0);
}

/** 收入（元）：期内 paid 订单 amount 之和，排除内部/管理员，分→元 */
async function revenueInRange(start: Date | null, end: Date | null): Promise<number> {
  let rows: { s: bigint | null }[];
  if (start && end) {
    rows = await prisma.$queryRaw<{ s: bigint | null }[]>`
      SELECT COALESCE(SUM(o.amount), 0)::bigint AS s
      FROM "Order" o
      JOIN "User" u ON u.id = o."userId"
      WHERE o.status = 'paid'
        AND u."isInternal" = false AND u.role = 'user'
        AND o."paidAt" >= ${start} AND o."paidAt" < ${end}`;
  } else {
    rows = await prisma.$queryRaw<{ s: bigint | null }[]>`
      SELECT COALESCE(SUM(o.amount), 0)::bigint AS s
      FROM "Order" o
      JOIN "User" u ON u.id = o."userId"
      WHERE o.status = 'paid'
        AND u."isInternal" = false AND u.role = 'user'`;
  }
  const cents = Number(rows[0]?.s ?? 0);
  return cents / 100;
}

/** 自学用户数：期内付费且该用户曾 AC 过至少一道题（AC 时间不限） */
async function selfLearnInRange(start: Date | null, end: Date | null): Promise<number> {
  let rows: { c: bigint }[];
  if (start && end) {
    rows = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(DISTINCT o."userId")::bigint AS c
      FROM "Order" o
      JOIN "User" u ON u.id = o."userId"
      WHERE o.status = 'paid'
        AND u."isInternal" = false AND u.role = 'user'
        AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
        AND EXISTS (
          SELECT 1 FROM "Submission" s
          WHERE s."userId" = o."userId" AND s.status = 'AC'
        )`;
  } else {
    rows = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(DISTINCT o."userId")::bigint AS c
      FROM "Order" o
      JOIN "User" u ON u.id = o."userId"
      WHERE o.status = 'paid'
        AND u."isInternal" = false AND u.role = 'user'
        AND EXISTS (
          SELECT 1 FROM "Submission" s
          WHERE s."userId" = o."userId" AND s.status = 'AC'
        )`;
  }
  return Number(rows[0]?.c ?? 0);
}

/**
 * 订阅类型分布（当前时刻快照）
 *
 * 口径：
 *   - 月/季/年订阅：非内部账号、当前订阅未过期、且存在至少一笔 status='paid' 的订单（真付费）
 *   - 内部赠阅：isInternal=true 的账号 + 非内部但 plan≠free 未过期却无 paid 订单的账号（admin 后台手动设的订阅）
 */
async function subscriptionTypeDistribution() {
  const now = new Date();

  const countPaidPlan = async (plan: "monthly" | "quarterly" | "yearly") => {
    const rows = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(DISTINCT u.id)::bigint AS c
      FROM "User" u
      WHERE u.role = 'user' AND u."isInternal" = false
        AND u.plan = ${plan}
        AND u."planExpireAt" > ${now}
        AND EXISTS (
          SELECT 1 FROM "Order" o
          WHERE o."userId" = u.id AND o.status = 'paid'
        )`;
    return Number(rows[0]?.c ?? 0);
  };

  const [monthly, quarterly, yearly, internalExplicit, adminGranted] = await Promise.all([
    countPaidPlan("monthly"),
    countPaidPlan("quarterly"),
    countPaidPlan("yearly"),
    prisma.user.count({
      where: { role: "user", isInternal: true },
    }),
    prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(DISTINCT u.id)::bigint AS c
      FROM "User" u
      WHERE u.role = 'user' AND u."isInternal" = false
        AND u.plan <> 'free'
        AND u."planExpireAt" > ${now}
        AND NOT EXISTS (
          SELECT 1 FROM "Order" o
          WHERE o."userId" = u.id AND o.status = 'paid'
        )`.then((rows) => Number(rows[0]?.c ?? 0)),
  ]);

  return {
    monthly,
    quarterly,
    yearly,
    internal: internalExplicit + adminGranted,
  };
}

/** 目标等级分布：1-8 + 未填；注册用户(排除内部/管理员)的 targetLevel 计数 */
async function targetLevelDistribution() {
  const rows = await prisma.user.groupBy({
    by: ["targetLevel"],
    where: { role: "user", isInternal: false },
    _count: { _all: true },
  });
  const map = new Map<number | null, number>();
  for (const r of rows) map.set(r.targetLevel, r._count._all);
  const levels: { level: number | null; count: number }[] = [];
  for (let i = 1; i <= 8; i++) levels.push({ level: i, count: map.get(i) ?? 0 });
  levels.push({ level: null, count: map.get(null) ?? 0 });
  return levels;
}

async function computeBasic() {
  const { start: yStart, end: yEnd } = yesterdayRange();
  const now = new Date();
  const sevenAgo = daysAgo(7, now);

  const [
    regY, reg7, regT,
    payY, pay7, payT,
    selfY, self7, selfT,
    revY, rev7, revT,
    subDist, levelDist,
  ] = await Promise.all([
    registeredInRange(yStart, yEnd),
    registeredInRange(sevenAgo, now),
    registeredInRange(null, null),
    paidInRange(yStart, yEnd),
    paidInRange(sevenAgo, now),
    paidInRange(null, null),
    selfLearnInRange(yStart, yEnd),
    selfLearnInRange(sevenAgo, now),
    selfLearnInRange(null, null),
    revenueInRange(yStart, yEnd),
    revenueInRange(sevenAgo, now),
    revenueInRange(null, null),
    subscriptionTypeDistribution(),
    targetLevelDistribution(),
  ]);

  const safeRatio = (num: number, den: number) => (den > 0 ? num / den : 0);

  return {
    registered: { yesterday: regY, last7d: reg7, total: regT },
    paid: { yesterday: payY, last7d: pay7, total: payT },
    selfLearn: { yesterday: selfY, last7d: self7, total: selfT },
    revenue: { yesterday: revY, last7d: rev7, total: revT },
    paidConvRate: {
      yesterday: safeRatio(payY, regY),
      last7d: safeRatio(pay7, reg7),
      total: safeRatio(payT, regT),
    },
    selfLearnConvRate: {
      yesterday: safeRatio(selfY, payY),
      last7d: safeRatio(self7, pay7),
      total: safeRatio(selfT, payT),
    },
    subscriptionTypes: subDist,
    targetLevels: levelDist,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const basic = await computeBasic();
    return Response.json(
      { basic },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[Dashboard API]", msg);
    return Response.json({ error: "数据加载失败" }, { status: 500 });
  }
}
