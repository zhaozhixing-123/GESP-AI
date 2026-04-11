import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getSubscriptionInfo } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const jwtUser = getUserFromRequest(request);
  if (!jwtUser) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const [dbUser, sub] = await Promise.all([
    prisma.user.findUnique({
      where: { id: jwtUser.userId },
      select: { id: true, username: true, role: true, plan: true, planExpireAt: true },
    }),
    getSubscriptionInfo(jwtUser.userId),
  ]);

  if (!dbUser) {
    return Response.json({ error: "用户不存在" }, { status: 404 });
  }

  return Response.json({
    user: {
      id: dbUser.id,
      username: dbUser.username,
      role: dbUser.role,
      plan: dbUser.plan,
      planExpireAt: dbUser.planExpireAt,
      isPaid: sub.isPaid,
      daysLeft: sub.daysLeft,
    },
  });
}
