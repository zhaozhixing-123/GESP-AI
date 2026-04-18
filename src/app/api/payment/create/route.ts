import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { PLAN_AMOUNTS, createXunhuOrder } from "@/lib/xunhu";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

const VALID_PLANS = ["monthly", "quarterly", "yearly"] as const;
type Plan = (typeof VALID_PLANS)[number];

const CREATE_RATE_LIMIT = { name: "payment_create", windowMs: 600_000, maxRequests: 20 };

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  // 双维度限流，防止 userId 或 IP 任一被用来刷单
  const userRl = checkRateLimit(CREATE_RATE_LIMIT, `user_${user.userId}`);
  const ipRl = checkRateLimit(CREATE_RATE_LIMIT, `ip_${getClientIp(request)}`);
  if (!userRl.allowed || !ipRl.allowed) {
    return Response.json({ error: "下单请求过于频繁，请稍后再试" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const plan = body.plan as Plan;

  if (!VALID_PLANS.includes(plan)) {
    return Response.json({ error: "无效的订阅计划" }, { status: 400 });
  }

  const amount = PLAN_AMOUNTS[plan];
  const random = crypto.randomBytes(4).toString("hex");
  const orderNo = `GESP_${user.userId}_${Date.now()}_${random}`;

  try {
    // 先在数据库创建 pending 订单
    await prisma.order.create({
      data: { userId: user.userId, orderNo, plan, amount, status: "pending" },
    });

    const siteOrigin = process.env.SITE_ORIGIN;
    if (!siteOrigin) {
      console.error("[Payment/Create] SITE_ORIGIN 环境变量未配置");
      return Response.json({ error: "支付功能配置不完整，请联系管理员" }, { status: 500 });
    }
    const { qrcodeUrl } = await createXunhuOrder({
      orderNo,
      amount,
      plan,
      notifyUrl: `${siteOrigin}/api/payment/notify`,
      returnUrl: `${siteOrigin}/payment/success`,
    });

    return Response.json({ orderNo, qrcodeUrl, amount });
  } catch (e: any) {
    console.error("[Payment/Create]", e?.message ?? "unknown error");
    return Response.json({ error: "创建订单失败，请重试" }, { status: 500 });
  }
}
