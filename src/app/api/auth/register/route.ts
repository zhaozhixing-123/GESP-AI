import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

const REGISTER_RATE_LIMIT = { name: "register", windowMs: 3600_000, maxRequests: 5 };

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(REGISTER_RATE_LIMIT, ip);
    if (!rl.allowed) {
      return Response.json(
        { error: "注册过于频繁，请一小时后再试" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const { email: rawEmail, code, nickname, password, targetLevel, examDate, phone } =
      await request.json();

    if (!rawEmail || !code || !nickname || !password) {
      return Response.json({ error: "必填项不能为空" }, { status: 400 });
    }

    // 归一化邮箱（去空格 + 转小写），确保与 send-code/login 记录一致
    const email = String(rawEmail).trim().toLowerCase();

    // 邮箱格式校验
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "邮箱格式不正确" }, { status: 400 });
    }

    // 昵称校验
    if (nickname.length < 2 || nickname.length > 20) {
      return Response.json(
        { error: "昵称长度需要在 2-20 个字符之间" },
        { status: 400 }
      );
    }
    if (!/^[a-zA-Z0-9\u4e00-\u9fa5_-]+$/.test(nickname)) {
      return Response.json(
        { error: "昵称只能包含字母、数字、中文、下划线和横线" },
        { status: 400 }
      );
    }

    // 密码校验
    if (password.length < 6) {
      return Response.json({ error: "密码长度至少 6 个字符" }, { status: 400 });
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return Response.json({ error: "密码需要同时包含字母和数字" }, { status: 400 });
    }

    if (!targetLevel || targetLevel < 3 || targetLevel > 8) {
      return Response.json(
        { error: "请选择目标考试级别（3-8 级）" },
        { status: 400 }
      );
    }
    if (!examDate) {
      return Response.json({ error: "请选择目标考试日期" }, { status: 400 });
    }

    // 校验邮箱验证码（原子操作：匹配+标记已使用一步完成）
    const upd = await prisma.verificationCode.updateMany({
      where: {
        email,
        code,
        type: "register",
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: { used: true },
    });

    if (upd.count === 0) {
      return Response.json({ error: "验证码无效或已过期" }, { status: 400 });
    }

    // 检查邮箱是否已注册（返回通用错误，防止邮箱枚举）
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return Response.json({ error: "验证码无效或已过期" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Admin 由环境变量 INITIAL_ADMIN_EMAIL 指定，而非自动授予首个注册用户
    const ADMIN_EMAIL = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    const isAdmin = !!ADMIN_EMAIL && email === ADMIN_EMAIL;
    const role = isAdmin ? "admin" : "user";

    const user = await prisma.user.create({
      data: {
        email,
        emailVerified: true,
        nickname,
        passwordHash,
        role,
        targetLevel: parseInt(String(targetLevel)),
        examDate: new Date(examDate),
        phone: phone?.trim() || null,
        plan: isAdmin ? "yearly" : "free",
        planExpireAt: isAdmin ? new Date("2099-12-31") : null,
      },
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
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
  } catch (e) {
    console.error("Register error:", e);
    return Response.json({ error: "注册失败，请重试" }, { status: 500 });
  }
}
