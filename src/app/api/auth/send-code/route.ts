import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateCode, sendVerificationEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

const IP_RATE_LIMIT = { name: "send_code_ip", windowMs: 60_000, maxRequests: 5 };
const EMAIL_RATE_LIMIT = { name: "send_code_email", windowMs: 60_000, maxRequests: 1 };

// A2: 所有分支统一最小响应时长，抹平邮箱存在/不存在的时间差
const MIN_RESPONSE_MS = 1200;

/** POST /api/auth/send-code — 发送邮箱验证码 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const finalize = async <T,>(build: () => T): Promise<T> => {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_RESPONSE_MS) {
      await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
    }
    return build();
  };

  try {
    const ip = getClientIp(request);
    const ipRl = checkRateLimit(IP_RATE_LIMIT, ip);
    if (!ipRl.allowed) {
      // 限流错误直接返回，不填平（否则攻击者可用 429 判断邮箱状态反而不对）
      return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const { email: rawEmail, type } = await request.json();

    if (!rawEmail || !type) {
      return Response.json({ error: "参数不完整" }, { status: 400 });
    }

    if (!["register", "reset_password"].includes(type)) {
      return Response.json({ error: "无效的验证类型" }, { status: 400 });
    }

    const email = String(rawEmail).trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "邮箱格式不正确" }, { status: 400 });
    }

    const emailRl = checkRateLimit(EMAIL_RATE_LIMIT, `email_${email}`);
    if (!emailRl.allowed) {
      return Response.json({ error: "验证码已发送，请 60 秒后再试" }, { status: 429 });
    }

    // 注册时邮箱已存在 / 重置密码时邮箱不存在 → 静默成功（防邮箱枚举）
    const existing = await prisma.user.findUnique({ where: { email } });
    const shouldSuppress =
      (type === "register" && existing) ||
      (type === "reset_password" && !existing);

    if (shouldSuppress) {
      return finalize(() => Response.json({ message: "验证码已发送" }));
    }

    // A4: 先发邮件，成功后再写 DB。Resend 失败 → 不污染 DB
    const code = generateCode();
    await sendVerificationEmail(email, code, type as "register" | "reset_password");

    await prisma.verificationCode.deleteMany({
      where: { email, type, used: false },
    });
    await prisma.verificationCode.create({
      data: {
        email,
        code,
        type,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return finalize(() => Response.json({ message: "验证码已发送" }));
  } catch (e: any) {
    console.error("[SendCode]", e?.message ?? "unknown error");
    // 失败也要填平，否则 Resend 超时等路径会泄漏"走到长路径"
    return finalize(() => Response.json({ error: "发送失败，请重试" }, { status: 500 }));
  }
}
