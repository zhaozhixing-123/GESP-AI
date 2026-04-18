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

    const { email: rawEmail, code, newPassword } = await request.json();

    if (!rawEmail || !code || !newPassword) {
      return Response.json({ error: "参数不完整" }, { status: 400 });
    }

    // 归一化邮箱，与 send-code/register 保持一致
    const email = String(rawEmail).trim().toLowerCase();

    if (newPassword.length < 6) {
      return Response.json({ error: "密码长度至少 6 个字符" }, { status: 400 });
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return Response.json({ error: "密码需要同时包含字母和数字" }, { status: 400 });
    }

    // 校验验证码（原子操作：查找最新未作废的验证码）
    const record = await prisma.verificationCode.findFirst({
      where: {
        email,
        type: "reset_password",
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return Response.json({ error: "验证码无效或已过期" }, { status: 400 });
    }

    // 尝试次数 +1，超过 5 次强制作废
    const newAttempts = record.attempts + 1;
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: {
        attempts: { increment: 1 },
        used: newAttempts >= 5 ? true : undefined,
      },
    });

    if (record.code !== code) {
      const msg = newAttempts >= 5
        ? "验证码已失效，请重新获取"
        : "验证码错误";
      return Response.json({ error: msg }, { status: 400 });
    }

    // 验证码正确，标记已使用
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { used: true },
    });

    // 检查新密码不能与旧密码相同
    const user = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true },
    });
    if (user && await bcrypt.compare(newPassword, user.passwordHash)) {
      return Response.json({ error: "新密码不能与旧密码相同" }, { status: 400 });
    }

    // 更新密码 + 递增 tokenVersion，使所有已签发 JWT 立即失效
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
    });

    return Response.json({ message: "密码重置成功" });
  } catch (e: any) {
    console.error("[ResetPassword]", e?.message ?? "unknown error");
    return Response.json({ error: "重置失败，请重试" }, { status: 500 });
  }
}
