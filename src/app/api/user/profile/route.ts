import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

/** GET /api/user/profile — 获取当前用户的个人信息和订阅状态 */
export async function GET(request: NextRequest) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
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
  });

  if (!user) return Response.json({ error: "用户不存在" }, { status: 404 });

  const now = new Date();
  const isPaid =
    user.role === "admin" ||
    (user.plan !== "free" && !!user.planExpireAt && user.planExpireAt > now);
  const daysLeft =
    user.plan !== "free" && user.planExpireAt && user.planExpireAt > now
      ? Math.ceil((user.planExpireAt.getTime() - now.getTime()) / 86_400_000)
      : null;

  return Response.json({ user: { ...user, isPaid, daysLeft } });
}

/** PATCH /api/user/profile — 更新可编辑字段 */
export async function PATCH(request: NextRequest) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });

  const body = await request.json();

  // 只允许更新这些字段
  const data: Record<string, unknown> = {};
  if (body.nickname !== undefined) {
    const nick = String(body.nickname).trim();
    if (nick.length >= 2 && nick.length <= 20) data.nickname = nick;
  }
  if (body.phone !== undefined) data.phone = body.phone || null;
  if (body.targetLevel !== undefined)
    data.targetLevel = body.targetLevel ? parseInt(body.targetLevel) : null;
  if (body.examDate !== undefined)
    data.examDate = body.examDate ? new Date(body.examDate) : null;

  const updated = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: { nickname: true, phone: true, targetLevel: true, examDate: true },
  });

  return Response.json({ user: updated });
}
