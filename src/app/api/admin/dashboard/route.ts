import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_AMOUNTS } from "@/lib/xunhu";

const DAY_MS = 86_400_000;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function tomorrowStart(): Date {
  const d = todayStart();
  d.setDate(d.getDate() + 1);
  return d;
}

// Fill missing days in daily registration data
function fillDays(rows: { day: Date; count: number }[], since: Date): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = new Date(r.day).toISOString().slice(0, 10);
    map.set(key, Number(r.count));
  }
  const result: { date: string; count: number }[] = [];
  const cur = new Date(since);
  const end = new Date();
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 10);
    result.push({ date: key, count: map.get(key) || 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// Compute retention for users who registered N days ago
async function computeRetention(n: number) {
  const cohortStart = daysAgo(n);
  const cohortEnd = new Date(cohortStart);
  cohortEnd.setDate(cohortEnd.getDate() + 1);
  const tStart = todayStart();
  const tEnd = tomorrowStart();

  const cohortUsers = await prisma.user.findMany({
    where: { role: "user", createdAt: { gte: cohortStart, lt: cohortEnd } },
    select: { id: true },
  });
  if (cohortUsers.length === 0) return { cohortSize: 0, retained: 0 };

  const ids = cohortUsers.map((u) => u.id);
  const active = await prisma.submission.findMany({
    where: { userId: { in: ids }, createdAt: { gte: tStart, lt: tEnd } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return { cohortSize: cohortUsers.length, retained: active.length };
}

async function computeGrowth() {
  const now = new Date();
  const thirtyDaysAgo = daysAgo(30);

  const [
    dailyReg,
    totalUsers,
    paidUsers,
    planDist,
    revenue,
    dauUsers,
    wauUsers,
    mauUsers,
    retD1,
    retD7,
    retD30,
  ] = await Promise.all([
    // Daily registrations
    prisma.$queryRaw<{ day: Date; count: number }[]>`
      SELECT DATE("createdAt") AS day, COUNT(*)::int AS count
      FROM "User" WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt") ORDER BY day`,
    // Total users (non-admin)
    prisma.user.count({ where: { role: "user" } }),
    // Paid users
    prisma.user.count({
      where: { role: "user", plan: { not: "free" }, planExpireAt: { gt: now } },
    }),
    // Plan distribution
    prisma.user.groupBy({
      by: ["plan"],
      where: { role: "user", plan: { not: "free" }, planExpireAt: { gt: now } },
      _count: { id: true },
    }),
    // Revenue last 30 days
    prisma.order.aggregate({
      where: { status: "paid", paidAt: { gte: thirtyDaysAgo } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    // DAU
    prisma.submission.findMany({
      where: { createdAt: { gte: daysAgo(1) } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    // WAU
    prisma.submission.findMany({
      where: { createdAt: { gte: daysAgo(7) } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    // MAU
    prisma.submission.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    // Retention
    computeRetention(1),
    computeRetention(7),
    computeRetention(30),
  ]);

  const freeUsers = totalUsers - paidUsers;
  const conversionRate = totalUsers > 0 ? paidUsers / totalUsers : 0;

  // MRR: normalize each plan's price to monthly
  const planMonthlyFen: Record<string, number> = {
    monthly: PLAN_AMOUNTS.monthly,
    quarterly: Math.round(PLAN_AMOUNTS.quarterly / 3),
    yearly: Math.round(PLAN_AMOUNTS.yearly / 12),
  };
  let mrr = 0;
  const planDistResult = planDist.map((p) => {
    const count = p._count.id;
    mrr += (planMonthlyFen[p.plan] || 0) * count;
    return { plan: p.plan, count };
  });

  return {
    dailyRegistrations: fillDays(dailyReg, thirtyDaysAgo),
    totalUsers,
    paidUsers,
    freeUsers,
    conversionRate,
    planDistribution: planDistResult,
    mrr,
    revenue30d: {
      amount: revenue._sum.amount || 0,
      orderCount: revenue._count.id,
    },
    dau: dauUsers.length,
    wau: wauUsers.length,
    mau: mauUsers.length,
    retention: { d1: retD1, d7: retD7, d30: retD30 },
  };
}

async function computeLearning() {
  const [
    problemStats,
    totalSubmissions,
    acCount,
    submitters,
    errorTop,
    chatCount,
    chatUsers,
    variantUnlocks,
    variantSubs,
    variantAC,
  ] = await Promise.all([
    // Per-problem pass rate
    prisma.$queryRaw<{ problemId: number; total: number; ac: number }[]>`
      SELECT "problemId", COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'AC')::int AS ac
      FROM "Submission" GROUP BY "problemId"`,
    // Total submissions
    prisma.submission.count(),
    // AC submissions
    prisma.submission.count({ where: { status: "AC" } }),
    // Distinct submitters
    prisma.submission.findMany({
      select: { userId: true },
      distinct: ["userId"],
    }),
    // Error type TOP 5
    prisma.wrongBookAnalysis.groupBy({
      by: ["errorType"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
    // Chat messages (user only)
    prisma.chatHistory.count({ where: { role: "user" } }),
    // Chat distinct users
    prisma.chatHistory.findMany({
      where: { role: "user" },
      select: { userId: true },
      distinct: ["userId"],
    }),
    // Variant unlocks
    prisma.variantUnlock.count(),
    // Variant submissions
    prisma.variantSubmission.count(),
    // Variant AC
    prisma.variantSubmission.count({ where: { status: "AC" } }),
  ]);

  // Pass rate distribution: bucket into 5 ranges
  const buckets = [
    { range: "0-20%", count: 0 },
    { range: "20-40%", count: 0 },
    { range: "40-60%", count: 0 },
    { range: "60-80%", count: 0 },
    { range: "80-100%", count: 0 },
  ];
  for (const p of problemStats) {
    const rate = p.total > 0 ? p.ac / p.total : 0;
    const idx = Math.min(Math.floor(rate * 5), 4);
    buckets[idx].count++;
  }

  const activeSubmitters = submitters.length;

  return {
    totalSubmissions,
    totalAC: acCount,
    activeSubmitters,
    avgSubmissionsPerUser: activeSubmitters > 0 ? Math.round(totalSubmissions / activeSubmitters) : 0,
    avgACPerUser: activeSubmitters > 0 ? Math.round(acCount / activeSubmitters) : 0,
    passRateDistribution: buckets,
    errorTypeTop5: errorTop.map((e) => ({ errorType: e.errorType, count: e._count.id })),
    chatMessageCount: chatCount,
    chatUserCount: chatUsers.length,
    variantUnlocks,
    variantSubmissions: variantSubs,
    variantAC,
  };
}

async function computeOperations() {
  const thirtyDaysAgo = daysAgo(30);

  const [hourly, levelDist, examUsers] = await Promise.all([
    // Hourly distribution (China time)
    prisma.$queryRaw<{ hour: number; count: number }[]>`
      SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'Asia/Shanghai')::int AS hour,
        COUNT(*)::int AS count
      FROM "Submission"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY hour ORDER BY hour`,
    // Target level distribution
    prisma.user.groupBy({
      by: ["targetLevel"],
      where: { role: "user", targetLevel: { not: null } },
      _count: { id: true },
      orderBy: { targetLevel: "asc" },
    }),
    // Exam users (set exam date)
    prisma.user.count({ where: { role: "user", examDate: { not: null } } }),
  ]);

  // Fill all 24 hours
  const hourMap = new Map(hourly.map((h) => [h.hour, h.count]));
  const hourlyFull = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: hourMap.get(i) || 0,
  }));

  return {
    hourlyDistribution: hourlyFull,
    levelDistribution: levelDist.map((l) => ({
      level: l.targetLevel as number,
      count: l._count.id,
    })),
    examUsers,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const [growth, learning, operations] = await Promise.all([
      computeGrowth(),
      computeLearning(),
      computeOperations(),
    ]);

    return Response.json(
      { growth, learning, operations },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (e) {
    console.error("[Dashboard API]", e);
    return Response.json({ error: "数据加载失败" }, { status: 500 });
  }
}
