import { prisma } from "./prisma";

export interface SubscriptionInfo {
  isPaid: boolean;
  plan: string;        // free | monthly | quarterly | yearly
  planExpireAt: Date | null;
  daysLeft: number | null;
}

/** 从数据库获取用户订阅状态（admin 始终视为有效付费） */
export async function getSubscriptionInfo(userId: number): Promise<SubscriptionInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, plan: true, planExpireAt: true },
  });

  if (!user) {
    return { isPaid: false, plan: "free", planExpireAt: null, daysLeft: null };
  }

  if (user.role === "admin") {
    return { isPaid: true, plan: user.plan, planExpireAt: user.planExpireAt, daysLeft: null };
  }

  const isPaid =
    user.plan !== "free" &&
    !!user.planExpireAt &&
    user.planExpireAt > new Date();

  const daysLeft =
    isPaid && user.planExpireAt
      ? Math.max(0, Math.ceil((user.planExpireAt.getTime() - Date.now()) / 86_400_000))
      : null;

  return {
    isPaid,
    plan: isPaid ? user.plan : "free",
    planExpireAt: user.planExpireAt,
    daysLeft,
  };
}

/**
 * 免费用户限 1 题检查：
 * - 付费/admin → true
 * - 从未提交过 → true（可以开始第 1 道免费题）
 * - 提交过此题 → true（可以继续）
 * - 提交过其他题 → false（已用完免费额度）
 */
export async function checkFreeLimit(
  userId: number,
  problemId: number
): Promise<boolean> {
  const info = await getSubscriptionInfo(userId);
  if (info.isPaid) return true;

  const tried = await prisma.submission.findMany({
    where: { userId },
    select: { problemId: true },
    distinct: ["problemId"],
  });

  const triedIds = tried.map((s) => s.problemId);
  return triedIds.length === 0 || triedIds.includes(problemId);
}

/**
 * 计算续费后的到期时间：
 * - 订阅未过期 → 从原到期时间往后延
 * - 已过期或从未订阅 → 从现在开始
 */
/**
 * 安全地给日期加 N 个月，处理月末边界
 * 例: 1/31 + 1 月 → 2/28（而非 3/3）
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  // 如果日期溢出到下个月（如 31→3），回退到该月最后一天
  if (result.getDate() !== day) {
    result.setDate(0); // 设为上个月最后一天
  }
  return result;
}

export function calculateExpireAt(
  currentExpireAt: Date | null,
  plan: string
): Date {
  const base =
    currentExpireAt && currentExpireAt > new Date()
      ? new Date(currentExpireAt)
      : new Date();

  switch (plan) {
    case "monthly":
      return addMonths(base, 1);
    case "quarterly":
      return addMonths(base, 3);
    case "yearly":
      base.setFullYear(base.getFullYear() + 1);
      return base;
    default:
      return base;
  }
}
