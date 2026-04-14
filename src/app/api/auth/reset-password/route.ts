import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

const RATE_LIMIT = { name: "reset_password", windowMs: 3600_000, maxRequests: 5 };

/** POST /api/auth/reset-password — 验证码重置密码 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(RATE_LIMIT, ip);
    if (!rl.allowed) {
      return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
    }

    const { email, code, newPassword } = await request.json();

    if (!email || !code || !newPassword) {
      return Response.json({ error: "参数不完整" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return Response.json({ error: "密码长度至少 6 个字符" }, { status: 400 });
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return Response.json({ error: "密码需要同时包含字母和数字" }, { status: 400 });
    }

    // 校验验证码
    const record = await prisma.verificationCode.findFirst({
      where: {
        email,
        code,
        type: "reset_password",
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return Response.json({ error: "验证码无效或已过期" }, { status: 400 });
    }

    // 标记验证码已使用
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { used: true },
    });

    // 更新密码
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: { passwordHash },
    });

    return Response.json({ message: "密码重置成功" });
  } catch (e) {
    console.error("[ResetPassword]", e);
    return Response.json({ error: "重置失败，请重试" }, { status: 500 });
  }
}
