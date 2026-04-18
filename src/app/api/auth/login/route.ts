import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

const LOGIN_RATE_LIMIT = { name: "login", windowMs: 60_000, maxRequests: 10 };

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(LOGIN_RATE_LIMIT, ip);
    if (!rl.allowed) {
      return Response.json(
        { error: "登录尝试过于频繁，请稍后再试" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const { email: rawEmail, password } = await request.json();

    if (!rawEmail || !password) {
      return Response.json({ error: "邮箱和密码不能为空" }, { status: 400 });
    }

    // 归一化邮箱，保证注册/登录使用同一键
    const email = String(rawEmail).trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return Response.json({ error: "邮箱或密码错误" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return Response.json({ error: "邮箱或密码错误" }, { status: 401 });
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    return Response.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        plan: user.plan,
        planExpireAt: user.planExpireAt,
      },
    });
  } catch {
    return Response.json({ error: "登录失败，请重试" }, { status: 500 });
  }
}
