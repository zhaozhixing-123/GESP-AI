import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { PLAN_AMOUNTS, createXunhuOrder } from "@/lib/xunhu";

const VALID_PLANS = ["monthly", "quarterly", "yearly"] as const;
type Plan = (typeof VALID_PLANS)[number];

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
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

    const origin = request.headers.get("origin") ?? "https://gesp.ai";
    const { qrcodeUrl } = await createXunhuOrder({
      orderNo,
      amount,
      plan,
      notifyUrl: `${origin}/api/payment/notify`,
      returnUrl: `${origin}/payment/success`,
    });

    return Response.json({ orderNo, qrcodeUrl, amount });
  } catch (e: any) {
    console.error("[Payment/Create]", e);
    return Response.json({ error: e.message ?? "创建订单失败" }, { status: 500 });
  }
}
