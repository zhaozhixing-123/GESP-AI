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
    // 用字符串拆分避免浮点精度问题（如 19.90 * 100 != 1990）
    const feeParts = (params.total_fee || "0").split(".");
    const yuan = parseInt(feeParts[0] || "0") * 100;
    const fen = feeParts[1] ? parseInt(feeParts[1].padEnd(2, "0").slice(0, 2)) : 0;
    const notifyAmount = yuan + fen;
    if (notifyAmount !== order.amount) {
      console.error("[Payment/Notify] 金额不匹配", { notifyAmount, expected: order.amount });
      return new Response("amount mismatch", { status: 400 });
    }

    const now = new Date();

    // 用事务串行化：order paid 检查 + user 续期全原子，避免虎皮椒并发重试
    // 导致同一单被多次叠加订阅时长
    const newExpireAt = await prisma.$transaction(async (tx) => {
      // 在事务里再读一次订单，确保幂等——两次并发回调只有先到的那次能更新
      const fresh = await tx.order.findUnique({
        where: { orderNo },
        select: { status: true, userId: true, plan: true },
      });
      if (!fresh || fresh.status === "paid") return null;

      await tx.order.update({
        where: { orderNo },
        data: { status: "paid", transactionId, paidAt: now },
      });

      const user = await tx.user.findUnique({
        where: { id: fresh.userId },
        select: { planExpireAt: true },
      });
      const expireAt = calculateExpireAt(user?.planExpireAt ?? null, fresh.plan);

      await tx.user.update({
        where: { id: fresh.userId },
        data: { plan: fresh.plan, planExpireAt: expireAt },
      });

      return expireAt;
    });

    if (!newExpireAt) {
      // 在事务内发现已是 paid，幂等返回
      return new Response("success");
    }

    console.log(`[Payment/Notify] 支付成功 orderNo=${orderNo} userId=${order.userId} expireAt=${newExpireAt}`);
    return new Response("success");
  } catch (e) {
    console.error("[Payment/Notify]", e);
    return new Response("error", { status: 500 });
  }
}
