import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidWebhookUrl, buildWebhookBody } from "@/lib/webhook";

// POST: 测试飞书 Webhook
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  const { webhookUrl } = await request.json();
  if (!webhookUrl) return Response.json({ error: "请输入 Webhook URL" }, { status: 400 });

  if (!isValidWebhookUrl(webhookUrl)) {
    return Response.json(
      { error: "Webhook URL 不合法，仅支持飞书（open.feishu.cn）或钉钉（oapi.dingtalk.com）" },
      { status: 400 }
    );
  }

  try {
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId }, select: { nickname: true } });
    const displayName = dbUser?.nickname || user.email;
    const text = `[GESP.AI 测试消息]\n飞书 Webhook 配置成功！\n学生：${displayName}\n这是一条测试消息，确认通知功能正常。`;

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildWebhookBody(webhookUrl, text),
    });

    if (!res.ok) {
      const body = await res.text();
      return Response.json({ error: `飞书返回错误: ${res.status} ${body.slice(0, 200)}` }, { status: 400 });
    }

    return Response.json({ message: "测试消息已发送，请检查飞书" });
  } catch (e: any) {
    return Response.json({ error: `请求失败: ${e.message}` }, { status: 500 });
  }
}
