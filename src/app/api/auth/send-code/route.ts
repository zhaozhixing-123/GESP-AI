import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateCode, sendVerificationEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

const IP_RATE_LIMIT = { name: "send_code_ip", windowMs: 60_000, maxRequests: 5 };
const EMAIL_RATE_LIMIT = { name: "send_code_email", windowMs: 60_000, maxRequests: 1 };

/** POST /api/auth/send-code — 发送邮箱验证码 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const ipRl = checkRateLimit(IP_RATE_LIMIT, ip);
    if (!ipRl.allowed) {
      return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const { email, type } = await request.json();

    if (!email || !type) {
      return Response.json({ error: "参数不完整" }, { status: 400 });
    }

    if (!["register", "reset_password"].includes(type)) {
      return Response.json({ error: "无效的验证类型" }, { status: 400 });
    }

    // 邮箱格式校验
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "邮箱格式不正确" }, { status: 400 });
    }

    // 同一邮箱 60 秒内只能发一次
    const emailRl = checkRateLimit(EMAIL_RATE_LIMIT, `email_${email}`);
    if (!emailRl.allowed) {
      return Response.json({ error: "验证码已发送，请 60 秒后再试" }, { status: 429 });
    }

    // 注册时检查邮箱是否已存在（静默返回，防止邮箱枚举）
    if (type === "register") {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return Response.json({ message: "验证码已发送" });
      }
    }

    // 重置密码时检查邮箱是否存在（静默返回，防止邮箱枚举）
    if (type === "reset_password") {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) {
        return Response.json({ message: "验证码已发送" });
      }
    }

    // 清理该邮箱+类型的旧未使用验证码，确保同一时间只有一条有效
    await prisma.verificationCode.deleteMany({
      where: { email, type, used: false },
    });

    // 生成验证码并存库
    const code = generateCode();
    await prisma.verificationCode.create({
      data: {
        email,
        code,
        type,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 分钟有效
      },
    });

    // 发送邮件
    await sendVerificationEmail(email, code, type as "register" | "reset_password");

    return Response.json({ message: "验证码已发送" });
  } catch (e: any) {
    console.error("[SendCode]", e);
    return Response.json({ error: "发送失败，请重试" }, { status: 500 });
  }
}
