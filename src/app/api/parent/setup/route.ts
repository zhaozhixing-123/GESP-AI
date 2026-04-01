import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import bcrypt from "bcryptjs";

// POST: 首次设置家长密码
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { password } = await request.json();
  if (!password || password.length < 6) {
    return Response.json({ error: "家长密码至少 6 位" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { parentPassword: true },
  });

  if (dbUser?.parentPassword) {
    return Response.json({ error: "家长密码已设置，请通过修改密码功能更改" }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.userId },
    data: { parentPassword: hash },
  });

  return Response.json({ message: "家长密码设置成功" });
}
