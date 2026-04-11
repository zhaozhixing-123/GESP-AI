import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyXunhuSign } from "@/lib/xunhu";
import { calculateExpireAt } from "@/lib/subscription";

/**
 * POST /api/payment/notify — 虎皮椒支付回调
 * 验证签名 → 更新 Order → 更新 User 订阅
 * 必须返回纯文本 "success"，否则虎皮椒会重试
 */
export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    const params = Object.fromEntries(new URLSearchParams(text).entries());

    const appSecret = process.env.XUNHU_APPSECRET;
    if (!appSecret) {
      console.error("[Payment/Notify] XUNHU_APPSECRET 未配置");
      return new Response("error", { status: 500 });
    }

    if (!verifyXunhuSign(params, appSecret)) {
      console.warn("[Payment/Notify] 签名验证失败", params);
      return new Response("sign error", { status: 400 });
    }

    if (params.status !== "OD") {
      // 非已支付状态，忽略
      return new Response("success");
    }

    const { trade_order_id: orderNo, transaction_id: transactionId } = params;

    const order = await prisma.order.findUnique({ where: { orderNo } });
    if (!order) {
      console.error("[Payment/Notify] 订单不存在", orderNo);
      return new Response("order not found", { status: 404 });
    }

    if (order.status === "paid") {
      // 已处理过，幂等返回
      return new Response("success");
    }

    // 验证金额（虎皮椒传来的是元，我们存的是分）
    const notifyAmount = Math.round(parseFloat(params.total_fee) * 100);
    if (notifyAmount !== order.amount) {
      console.error("[Payment/Notify] 金额不匹配", { notifyAmount, expected: order.amount });
      return new Response("amount mismatch", { status: 400 });
    }

    const now = new Date();

    // 更新订单
    await prisma.order.update({
      where: { orderNo },
      data: { status: "paid", transactionId, paidAt: now },
    });

    // 更新用户订阅（支持续费叠加）
    const user = await prisma.user.findUnique({
      where: { id: order.userId },
      select: { planExpireAt: true },
    });

    const newExpireAt = calculateExpireAt(user?.planExpireAt ?? null, order.plan);

    await prisma.user.update({
      where: { id: order.userId },
      data: { plan: order.plan, planExpireAt: newExpireAt },
    });

    console.log(`[Payment/Notify] 支付成功 orderNo=${orderNo} userId=${order.userId} expireAt=${newExpireAt}`);
    return new Response("success");
  } catch (e) {
    console.error("[Payment/Notify]", e);
    return new Response("error", { status: 500 });
  }
}
