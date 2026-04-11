import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return Response.json({ error: "用户名和密码不能为空" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return Response.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return Response.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return Response.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        plan: user.plan,
        planExpireAt: user.planExpireAt,
      },
    });
  } catch {
    return Response.json({ error: "登录失败，请重试" }, { status: 500 });
  }
}
