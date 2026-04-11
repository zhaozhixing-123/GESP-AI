import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

/**
 * GET /api/payment/status?orderNo=GESP_1_xxx
 * 前端轮询此接口（每 2 秒），检查订单是否已支付
 */
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const orderNo = new URL(request.url).searchParams.get("orderNo");
  if (!orderNo) {
    return Response.json({ error: "缺少 orderNo" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { orderNo },
    select: { userId: true, status: true, plan: true },
  });

  if (!order || order.userId !== user.userId) {
    return Response.json({ error: "订单不存在" }, { status: 404 });
  }

  if (order.status !== "paid") {
    return Response.json({ status: "pending" });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { planExpireAt: true },
  });

  return Response.json({
    status: "paid",
    plan: order.plan,
    expireAt: dbUser?.planExpireAt,
  });
}
