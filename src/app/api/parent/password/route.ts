import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import bcrypt from "bcryptjs";

// PUT: 修改家长密码（需要旧密码）
export async function PUT(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { oldPassword, newPassword } = await request.json();
  if (!oldPassword || !newPassword) {
    return Response.json({ error: "请输入旧密码和新密码" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return Response.json({ error: "新密码至少 6 位" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { parentPassword: true },
  });

  if (!dbUser?.parentPassword) {
    return Response.json({ error: "尚未设置家长密码" }, { status: 400 });
  }

  const valid = await bcrypt.compare(oldPassword, dbUser.parentPassword);
  if (!valid) return Response.json({ error: "旧密码错误" }, { status: 403 });

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.userId },
    data: { parentPassword: hash },
  });

  return Response.json({ message: "家长密码修改成功" });
}
