import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return Response.json(
        { error: "用户名和密码不能为空" },
        { status: 400 }
      );
    }

    if (username.length < 2 || username.length > 20) {
      return Response.json(
        { error: "用户名长度需要在2-20个字符之间" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return Response.json(
        { error: "密码长度至少6个字符" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return Response.json({ error: "用户名已存在" }, { status: 409 });
    }

    // 第一个注册的用户自动成为管理员
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? "admin" : "user";

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, passwordHash, role },
    });

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return Response.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (e) {
    console.error("Register error:", e);
    return Response.json({ error: "注册失败，请重试" }, { status: 500 });
  }
}
