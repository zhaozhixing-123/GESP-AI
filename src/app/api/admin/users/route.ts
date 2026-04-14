import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/** GET /api/admin/users — 用户列表（含订阅状态和提交数） */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      nickname: true,
      role: true,
      plan: true,
      planExpireAt: true,
      targetLevel: true,
      examDate: true,
      phone: true,
      createdAt: true,
      _count: { select: { submissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const enriched = users.map((u) => ({
    ...u,
    isPaid:
      u.role === "admin" ||
      (u.plan !== "free" && !!u.planExpireAt && u.planExpireAt > now),
    daysLeft:
      u.plan !== "free" && u.planExpireAt && u.planExpireAt > now
        ? Math.ceil((u.planExpireAt.getTime() - now.getTime()) / 86_400_000)
        : null,
  }));

  return Response.json({ users: enriched });
}
