import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { calculateExpireAt } from "@/lib/subscription";

/**
 * PATCH /api/admin/users/[id]
 * 手动设置用户订阅：
 *   { plan, planExpireAt }  → 直接设置（planExpireAt 可为 null 清空）
 *   { plan, extend: true }  → 从当前到期时间/现在往后延一个周期
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const userId = parseInt(id);
  const body = await request.json();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { planExpireAt: true },
  });
  if (!user) return Response.json({ error: "用户不存在" }, { status: 404 });

  let plan: string = body.plan ?? "free";
  let planExpireAt: Date | null = null;

  if (plan === "free") {
    planExpireAt = null;
  } else if (body.extend) {
    // 从当前到期时间往后延一个套餐周期
    planExpireAt = calculateExpireAt(user.planExpireAt, plan);
  } else if (body.planExpireAt) {
    planExpireAt = new Date(body.planExpireAt);
  } else {
    // 直接用套餐周期从现在开始算
    planExpireAt = calculateExpireAt(null, plan);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { plan, planExpireAt },
    select: { id: true, username: true, plan: true, planExpireAt: true },
  });

  return Response.json({ user: updated });
}
