import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) return Response.json({ error: "未登录" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return Response.json({ error: "登录已过期" }, { status: 401 });

  try {
    const { focusMinutes, distractMinutes } = await request.json();

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { username: true, feishuWebhook: true },
    });

    if (!user?.feishuWebhook) {
      return Response.json({ sent: false, reason: "未配置飞书 Webhook" });
    }

    const now = new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const text = `[GESP.AI 专注提醒]\n学生：${user.username}\n本次专注：${focusMinutes}分钟 | 分心：${distractMinutes}分钟\n时间：${now}`;

    const res = await fetch(user.feishuWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text } }),
    });

    if (!res.ok) {
      console.error("[Focus] 飞书通知失败:", res.status, await res.text());
      return Response.json({ sent: false, reason: "飞书接口返回错误" });
    }

    return Response.json({ sent: true });
  } catch (e: any) {
    console.error("[Focus] 通知异常:", e);
    return Response.json({ error: "通知失败" }, { status: 500 });
  }
}
