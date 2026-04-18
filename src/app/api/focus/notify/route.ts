import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTokenFromRequest, decodeToken } from "@/lib/auth";
import { isValidWebhookUrl, buildWebhookBody } from "@/lib/webhook";
import { checkRateLimit } from "@/lib/ratelimit";

// A3: 单用户每 5 分钟最多一次通知，避免家长被轰炸
const NOTIFY_RATE_LIMIT = { name: "focus_notify", windowMs: 300_000, maxRequests: 1 };

function todayStr() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }); // YYYY-MM-DD
}

/**
 * POST /api/focus/notify
 * 触发"当前已累计的专注/分心时长超过上次通知点"的家长提醒。
 * 数字来源是服务端 DailyFocusLog，而非客户端自报，防止伪造。
 */
export async function POST(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) return Response.json({ error: "未登录" }, { status: 401 });
  const payload = decodeToken(token);
  if (!payload) return Response.json({ error: "登录已过期" }, { status: 401 });

  // tokenVersion 校验由后续 DB 读取天然覆盖（改密后 findUnique 的 tokenVersion 对不上就会拒绝）
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      nickname: true,
      feishuWebhook: true,
      tokenVersion: true,
      lastNotifyFocusMs: true,
      lastNotifyDistractMs: true,
    },
  });
  if (!user) return Response.json({ error: "登录已过期" }, { status: 401 });
  if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
    return Response.json({ error: "登录已过期" }, { status: 401 });
  }

  // 限流
  const rl = checkRateLimit(NOTIFY_RATE_LIMIT, `user_${payload.userId}`);
  if (!rl.allowed) {
    return Response.json({ sent: false, reason: "通知过于频繁，请稍后再试" });
  }

  try {
    if (!user.feishuWebhook) {
      return Response.json({ sent: false, reason: "未配置飞书 Webhook" });
    }
    if (!isValidWebhookUrl(user.feishuWebhook)) {
      return Response.json({ sent: false, reason: "Webhook URL 不合法" });
    }

    // 从服务端权威数据读取当天累计
    const log = await prisma.dailyFocusLog.findUnique({
      where: { userId_date: { userId: payload.userId, date: todayStr() } },
      select: { focusMs: true, distractMs: true },
    });
    const curFocusMs = log?.focusMs ?? 0;
    const curDistractMs = log?.distractMs ?? 0;

    // 仅当累计值确有增长时才通知
    if (curFocusMs <= user.lastNotifyFocusMs && curDistractMs <= user.lastNotifyDistractMs) {
      return Response.json({ sent: false, reason: "暂无新数据可通知" });
    }

    const focusMinutes = Math.max(0, Math.round(curFocusMs / 60000));
    const distractMinutes = Math.max(0, Math.round(curDistractMs / 60000));

    const now = new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const safeNickname = (user.nickname || "").replace(/[<>{}\[\]]/g, "");
    const text = `[GESP.AI 专注提醒]\n学生：${safeNickname}\n当前累计专注：${focusMinutes}分钟 | 分心：${distractMinutes}分钟\n时间：${now}`;

    const res = await fetch(user.feishuWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildWebhookBody(user.feishuWebhook, text),
    });

    if (!res.ok) {
      console.error(`[Focus] 飞书通知失败 status=${res.status}`);
      return Response.json({ sent: false, reason: "飞书接口返回错误" });
    }

    // 发送成功才推进通知游标
    await prisma.user.update({
      where: { id: payload.userId },
      data: {
        lastNotifyFocusMs: curFocusMs,
        lastNotifyDistractMs: curDistractMs,
      },
    });

    return Response.json({ sent: true });
  } catch (e: any) {
    console.error("[Focus] 通知异常:", e?.message ?? "unknown error");
    return Response.json({ error: "通知失败" }, { status: 500 });
  }
}
